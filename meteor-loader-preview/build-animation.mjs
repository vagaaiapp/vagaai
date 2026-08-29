import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const frames = 168;

const emerald = [0.243, 0.812, 0.557, 1];
const emeraldLight = [0.553, 0.914, 0.733, 1];
const emeraldDark = [0.043, 0.494, 0.322, 1];
const mintWhite = [0.973, 1, 0.984, 1];

const baseTransform = (opacity = 100) => ({
  ty: 'tr',
  p: { a: 0, k: [0, 0] },
  a: { a: 0, k: [0, 0] },
  s: { a: 0, k: [100, 100] },
  r: { a: 0, k: 0 },
  o: { a: 0, k: opacity },
  sk: { a: 0, k: 0 },
  sa: { a: 0, k: 0 },
  nm: 'Transform'
});

function ellipseGroup(name, position, size, color, opacity = 100) {
  return {
    ty: 'gr',
    nm: name,
    it: [
      { ty: 'el', d: 1, s: { a: 0, k: size }, p: { a: 0, k: position }, nm: `${name} Path` },
      { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: opacity }, r: 1, bm: 0, nm: `${name} Fill` },
      baseTransform()
    ]
  };
}

function pathGroup(name, vertices, inTangents, outTangents, color, opacity = 100) {
  return {
    ty: 'gr',
    nm: name,
    it: [
      {
        ty: 'sh',
        ind: 0,
        ks: { a: 0, k: { i: inTangents, o: outTangents, v: vertices, c: true } },
        nm: `${name} Path`
      },
      { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: opacity }, r: 1, bm: 0, nm: `${name} Fill` },
      baseTransform()
    ]
  };
}

function keyframes(values) {
  return values.map((entry, index) => {
    if (index === values.length - 1) return { t: entry.t, s: entry.v };
    return {
      t: entry.t,
      s: entry.v,
      e: values[index + 1].v,
      i: { x: [0.58], y: [1] },
      o: { x: [0.42], y: [0] }
    };
  });
}

function starGroup(index, x, y, size, phase, color) {
  const timeline = [];
  for (let t = 0; t <= frames; t += 21) {
    const wave = 0.5 + (0.5 * Math.sin(((Math.PI * 2 * t) / 84) + phase));
    timeline.push({
      t,
      opacity: Math.round(20 + (80 * wave)),
      scale: Math.round(82 + (22 * wave))
    });
  }
  return {
    ty: 'gr',
    nm: `Estrela ${index}`,
    it: [
      { ty: 'el', d: 1, s: { a: 0, k: [size, size] }, p: { a: 0, k: [0, 0] }, nm: `Estrela ${index} Path` },
      { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1, bm: 0, nm: `Estrela ${index} Fill` },
      {
        ...baseTransform(),
        p: { a: 0, k: [x, y] },
        s: { a: 1, k: keyframes(timeline.map(({ t, scale }) => ({ t, v: [scale, scale] }))) },
        o: { a: 1, k: keyframes(timeline.map(({ t, opacity }) => ({ t, v: [opacity] }))) }
      }
    ]
  };
}

const stars = [
  [28, 34, 2.8, 0.1, emeraldLight],
  [42, 82, 2.1, 1.4, emerald],
  [63, 20, 2.4, 2.7, mintWhite],
  [78, 108, 2.7, 4.1, emeraldLight],
  [99, 55, 2.0, 5.2, emeraldDark],
  [121, 121, 2.3, 0.8, emerald],
  [139, 30, 2.6, 2.1, emeraldLight],
  [157, 84, 2.1, 3.4, mintWhite],
  [182, 49, 2.8, 4.7, emerald],
  [201, 111, 2.2, 5.8, emeraldLight]
].map((star, index) => starGroup(index + 1, ...star));

const starLayer = {
  ddd: 0,
  ind: 1,
  ty: 4,
  nm: 'Estrelas VagaAI',
  sr: 1,
  ks: {
    o: { a: 0, k: 100 },
    r: { a: 0, k: 0 },
    p: { a: 0, k: [0, 0, 0] },
    a: { a: 0, k: [0, 0, 0] },
    s: { a: 0, k: [100, 100, 100] }
  },
  ao: 0,
  shapes: stars,
  ip: 0,
  op: frames,
  st: 0,
  bm: 0
};

const meteorPosition = [
  { t: 0, v: [18, 18, 0] },
  { t: 48, v: [61, 38, 0] },
  { t: 103, v: [124, 75, 0] },
  { t: 148, v: [180, 109, 0] },
  { t: frames, v: [210, 130, 0] }
];

const meteorLayer = {
  ddd: 0,
  ind: 2,
  ty: 4,
  nm: 'Meteorito VagaAI',
  sr: 1,
  ks: {
    o: {
      a: 1,
      k: keyframes([
        { t: 0, v: [0] },
        { t: 14, v: [100] },
        { t: 151, v: [100] },
        { t: frames, v: [0] }
      ])
    },
    r: {
      a: 1,
      k: keyframes([
        { t: 0, v: [23] },
        { t: 103, v: [27] },
        { t: frames, v: [30] }
      ])
    },
    p: { a: 1, k: keyframes(meteorPosition) },
    a: { a: 0, k: [0, 0, 0] },
    s: { a: 0, k: [100, 100, 100] }
  },
  ao: 0,
  shapes: [
    ellipseGroup('Brilho externo', [0, 0], [52, 52], emerald, 8),
    ellipseGroup('Brilho interno', [0, 0], [44, 44], emeraldLight, 12),
    pathGroup(
      'Cauda principal',
      [[-92, -13], [-42, -17], [-12, -16], [1, -13], [1, 13], [-13, 16], [-66, 15], [-48, 2]],
      [[0, 0], [-13, 0], [-8, 0], [-5, -2], [0, -5], [6, 0], [13, 0], [5, 3]],
      [[13, 0], [13, 0], [8, 0], [0, 5], [-5, 2], [-13, 0], [-9, 0], [-8, -4]],
      emerald
    ),
    pathGroup(
      'Luz da cauda',
      [[-78, -7], [-30, -10], [-6, -9], [1, -7], [1, 4], [-16, 8], [-55, 8]],
      [[0, 0], [-11, 0], [-6, 0], [-3, -1], [0, -3], [5, 0], [10, 0]],
      [[11, 0], [11, 0], [6, 0], [0, 3], [-4, 2], [-10, 0], [-8, -2]],
      emeraldLight,
      58
    ),
    ellipseGroup('Corpo externo', [0, 0], [36, 36], emeraldDark),
    ellipseGroup('Corpo interno', [0, 0], [27, 27], mintWhite),
    ellipseGroup('Cratera 1', [-5, -5], [4.2, 4.2], emeraldDark, 88),
    ellipseGroup('Cratera 2', [6, 1], [3.4, 3.4], emeraldDark, 82),
    ellipseGroup('Cratera 3', [-2, 7], [2.8, 2.8], emerald, 88),
    ellipseGroup('Reflexo', [-5, -9], [6, 2.8], mintWhite, 72)
  ],
  ip: 0,
  op: frames,
  st: 0,
  bm: 0
};

const animation = {
  v: '5.12.2',
  fr: 60,
  ip: 0,
  op: frames,
  w: 220,
  h: 140,
  nm: 'VagaAI — Meteorito premium',
  ddd: 0,
  assets: [],
  layers: [meteorLayer, starLayer],
  markers: []
};

fs.writeFileSync(
  path.join(directory, 'vagaai-meteor-loader.json'),
  `${JSON.stringify(animation, null, 2)}\n`,
  'utf8'
);

