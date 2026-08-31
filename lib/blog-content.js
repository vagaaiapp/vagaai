/*
 * Sanitizacao compartilhada do HTML editorial do blog.
 *
 * O CMS aceita rich text, mas a pagina publica nao deve confiar nem mesmo em
 * conteudo salvo por um administrador: uma sessao comprometida ou HTML colado
 * de outra origem viraria stored XSS. O sanitizador reconstrói somente uma
 * lista curta de elementos editoriais e seus atributos estritamente necessarios.
 * Ele nao depende de DOMParser para poder rodar tanto no Edge Middleware quanto
 * no navegador.
 */

const CONTENT_TAGS = new Set([
  'p', 'br', 'div', 'span', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'hr', 'figure', 'figcaption',
  'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeAttributeEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);?/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|colon|tab|newline);/gi, (_, name) => ({
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
      colon: ':', tab: '\t', newline: '\n',
    })[name.toLowerCase()]);
}

function safeCodePoint(value) {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : '';
}

function safeUrl(value, { image = false } = {}) {
  const decoded = decodeAttributeEntities(value).trim();
  if (!decoded || /[\u0000-\u001f\u007f]/.test(decoded)) return '';
  const compact = decoded.replace(/\s+/g, '').toLowerCase();
  if (/^(javascript|vbscript|data|file|blob):/.test(compact)) return '';

  if (/^(\/|#|\?)/.test(decoded) && !/^\/\//.test(decoded)) return decoded;
  try {
    const parsed = new URL(decoded);
    const allowed = image ? ['https:'] : ['http:', 'https:', 'mailto:', 'tel:'];
    return allowed.includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function parseAttributes(raw) {
  const attrs = [];
  let rest = String(raw || '');
  while (rest.length) {
    const ws = rest.match(/^\s+/);
    if (ws) {
      rest = rest.slice(ws[0].length);
      if (!rest.length) break;
    }
    const match = rest.match(/^([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/);
    if (!match) return null;
    attrs.push({ name: match[1].toLowerCase(), value: match[2] ?? match[3] ?? '' });
    rest = rest.slice(match[0].length);
  }
  return attrs;
}

function sanitizeTag(rawTag) {
  if (/^<!--/.test(rawTag) || /^<![^-]/.test(rawTag) || /^<\?/.test(rawTag)) return '';

  const closing = rawTag.match(/^<\s*\/\s*([a-z0-9]+)\s*>$/i);
  if (closing) {
    const tag = closing[1].toLowerCase();
    return CONTENT_TAGS.has(tag) && !VOID_TAGS.has(tag) ? `</${tag}>` : escapeHtml(rawTag);
  }

  const opening = rawTag.match(/^<\s*([a-z0-9]+)([\s\S]*?)\s*\/?>$/i);
  if (!opening) return escapeHtml(rawTag);
  const tag = opening[1].toLowerCase();
  if (!CONTENT_TAGS.has(tag)) return escapeHtml(rawTag);

  const attrs = parseAttributes(opening[2]);
  if (!attrs) return escapeHtml(rawTag);
  const byName = new Map(attrs.map(attr => [attr.name, attr.value]));
  const safeAttrs = [];

  if (tag === 'a') {
    const href = safeUrl(byName.get('href'));
    if (href) safeAttrs.push(`href="${escapeHtml(href)}"`);
    if (byName.has('title')) safeAttrs.push(`title="${escapeHtml(decodeAttributeEntities(byName.get('title')).slice(0, 300))}"`);
    if (byName.get('target') === '_blank') {
      safeAttrs.push('target="_blank"', 'rel="noopener noreferrer"');
    }
  }

  if (tag === 'img') {
    const src = safeUrl(byName.get('src'), { image: true });
    if (!src) return '';
    safeAttrs.push(`src="${escapeHtml(src)}"`);
    safeAttrs.push(`alt="${escapeHtml(decodeAttributeEntities(byName.get('alt') || '').slice(0, 500))}"`);
    if (byName.has('title')) safeAttrs.push(`title="${escapeHtml(decodeAttributeEntities(byName.get('title')).slice(0, 300))}"`);
    safeAttrs.push('loading="lazy"', 'decoding="async"');
  }

  return `<${tag}${safeAttrs.length ? ` ${safeAttrs.join(' ')}` : ''}>`;
}

export function sanitizeBlogHtml(html) {
  const input = String(html || '');
  let output = '';
  let cursor = 0;
  const tagPattern = /<[\s\S]*?>/g;
  let match;
  while ((match = tagPattern.exec(input))) {
    output += input.slice(cursor, match.index);
    output += sanitizeTag(match[0]);
    cursor = match.index + match[0].length;
  }
  output += input.slice(cursor);
  return output;
}
