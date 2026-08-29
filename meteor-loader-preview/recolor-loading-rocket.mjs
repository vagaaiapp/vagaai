import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error('Informe o caminho do arquivo Lottie original.');
}

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(workspaceRoot, 'assets', 'vagaai-loading-rocket.json');

const palette = {
  dark: [11, 126, 82],
  emerald: [62, 207, 142],
  light: [141, 233, 187],
  white: [248, 255, 251],
};

function mix(from, to, amount) {
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
}

function recolorRgb(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;

  if (chroma < 20 && max > 205) {
    const shade = Math.max(0.82, max / 255);
    return palette.white.map((channel) => Math.round(channel * shade));
  }

  if (chroma < 14 && max < 95) {
    return [red, green, blue];
  }

  const lightness = (max + min) / 510;
  if (lightness < 0.42) {
    return mix(palette.dark, palette.emerald, lightness / 0.42);
  }
  return mix(palette.emerald, palette.light, Math.min(1, (lightness - 0.42) / 0.5));
}

async function recolorEmbeddedPng(asset) {
  const match = /^data:image\/png;base64,(.+)$/s.exec(asset.p || '');
  if (!match) return false;

  const source = Buffer.from(match[1], 'base64');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const [red, green, blue] = recolorRgb(data[index], data[index + 1], data[index + 2]);
    data[index] = red;
    data[index + 1] = green;
    data[index + 2] = blue;
  }

  const png = await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
  asset.p = `data:image/png;base64,${png.toString('base64')}`;
  return true;
}

function recolorVectorValue(value) {
  if (!Array.isArray(value) || value.length < 3 || value.some((channel, index) => index < 3 && typeof channel !== 'number')) {
    return value;
  }

  const [red, green, blue] = recolorRgb(
    Math.round(value[0] * 255),
    Math.round(value[1] * 255),
    Math.round(value[2] * 255),
  );
  return [red / 255, green / 255, blue / 255, ...value.slice(3)];
}

function recolorColorProperty(color) {
  if (!color || !Array.isArray(color.k)) return;

  if (color.a === 0) {
    color.k = recolorVectorValue(color.k);
    return;
  }

  for (const keyframe of color.k) {
    if (keyframe.s) keyframe.s = recolorVectorValue(keyframe.s);
    if (keyframe.e) keyframe.e = recolorVectorValue(keyframe.e);
  }
}

function recolorVectorShapes(node) {
  if (!node || typeof node !== 'object') return;
  if ((node.ty === 'fl' || node.ty === 'st') && node.c) recolorColorProperty(node.c);
  for (const value of Object.values(node)) recolorVectorShapes(value);
}

function normalizeArtwork(animation) {
  const clone = structuredClone(animation);
  for (const asset of clone.assets || []) {
    if (typeof asset.p === 'string' && asset.p.startsWith('data:image/png;base64,')) asset.p = '__EMBEDDED_PNG__';
  }

  function normalizeColors(node) {
    if (!node || typeof node !== 'object') return;
    if ((node.ty === 'fl' || node.ty === 'st') && node.c) node.c = '__VECTOR_COLOR__';
    for (const value of Object.values(node)) normalizeColors(value);
  }
  normalizeColors(clone);
  return clone;
}

const original = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const recolored = structuredClone(original);
let embeddedPngCount = 0;

for (const asset of recolored.assets || []) {
  if (await recolorEmbeddedPng(asset)) embeddedPngCount += 1;
}
recolorVectorShapes(recolored);

if (JSON.stringify(normalizeArtwork(original)) !== JSON.stringify(normalizeArtwork(recolored))) {
  throw new Error('A validação detectou uma alteração fora da paleta visual.');
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(recolored)}\n`, 'utf8');

console.log(JSON.stringify({
  outputPath,
  embeddedPngCount,
  width: recolored.w,
  height: recolored.h,
  frameRate: recolored.fr,
  durationSeconds: (recolored.op - recolored.ip) / recolored.fr,
}, null, 2));
