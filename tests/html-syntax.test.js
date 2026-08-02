import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'index.template.html',
  'onboarding/vaga/index.html',
  'onboarding/curriculo/index.html',
  'app/index.html',
  'curriculo/index.html',
  'cv/index.html',
  'dashboard/index.html'
];

function inlineScripts(file) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attributes = match[1] || '';
    const source = match[2] || '';
    if (/application\/ld\+json/i.test(attributes)) continue;
    if (/\bsrc\s*=/i.test(attributes)) continue;
    if (!source.trim()) continue;
    scripts.push(source);
  }
  return scripts;
}

describe('Sintaxe dos scripts HTML críticos', () => {
  for (const file of files) {
    it(file, () => {
      const scripts = inlineScripts(file);
      assert.ok(scripts.length > 0, 'arquivo deve conter JavaScript inline');
      scripts.forEach((source) => {
        assert.doesNotThrow(() => new Function(source));
      });
    });
  }
});
