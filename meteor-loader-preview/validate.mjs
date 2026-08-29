import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const animation = JSON.parse(fs.readFileSync(path.join(directory, 'falling-meteor.json'), 'utf8'));
const preview = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');

assert.equal(animation.w, 1920);
assert.equal(animation.h, 1080);
assert.equal(animation.fr, 25);
assert.equal(animation.op / animation.fr, 1.8);
assert.equal(animation.layers.length, 11);
assert.equal(animation.assets.length, 0, 'a animação precisa permanecer vetorial e sem imagens externas');
assert.equal((preview.match(/id="meteor-loader"/g) || []).length, 1, 'a prévia deve renderizar apenas uma animação');
assert.match(preview, /lottie_light\.min\.js/);

console.log('Falling Meteor validado: 1920x1080, 1.8s, 25 FPS e sem recursos externos.');
