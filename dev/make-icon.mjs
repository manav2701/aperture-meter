// Draws the listing icon, ../.claude-plugin/icon.png: a camera iris in Aperture's colours.
// Pure arithmetic and Node's own zlib, so the icon can be rebuilt and checked by anyone.
// Run from this folder: node make-icon.mjs
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 1024;
const SAMPLES = 3; // supersampling per axis, for smooth edges
const DARK = [0x09, 0x09, 0x0b]; // --background
const ACCENT = [0xdf, 0xe1, 0x04]; // --accent

const OUTER = SIZE * 0.4; // radius of the whole iris
const OPENING = SIZE * 0.2; // distance from the centre to each blade edge
const GAP = SIZE * 0.009; // width of the dark line between two blades
const BLADES = 6;

/** The six inward normals of the opening, one per blade. */
const normals = Array.from({ length: BLADES }, (_, k) => {
  const angle = (k * 2 * Math.PI) / BLADES;
  return [Math.cos(angle), Math.sin(angle)];
});
/** How far along a blade edge its corner sits. */
const corner = OPENING * Math.tan(Math.PI / BLADES);

/** True where the iris metal is: inside the disc, outside the opening, not on a gap line. */
function onBlade(x, y) {
  if (Math.hypot(x, y) > OUTER) return false;
  let inOpening = true;
  for (const [nx, ny] of normals) {
    const along = x * nx + y * ny;
    const across = -x * ny + y * nx;
    if (along > OPENING) inOpening = false;
    // The blade edge runs along `along === OPENING`, and continues past its corner.
    if (Math.abs(along - OPENING) < GAP && across > corner) return false;
  }
  return !inOpening;
}

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let row = 0; row < SIZE; row++) {
  const start = row * (SIZE * 3 + 1);
  raw[start] = 0; // PNG filter: none
  for (let column = 0; column < SIZE; column++) {
    let hits = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const x = column + (sx + 0.5) / SAMPLES - SIZE / 2;
        const y = row + (sy + 0.5) / SAMPLES - SIZE / 2;
        if (onBlade(x, y)) hits++;
      }
    }
    const weight = hits / (SAMPLES * SAMPLES);
    const at = start + 1 + column * 3;
    for (let channel = 0; channel < 3; channel++)
      raw[at + channel] = Math.round(DARK[channel] + (ACCENT[channel] - DARK[channel]) * weight);
  }
}

/** CRC-32, as PNG defines it. */
const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bits per channel
header[9] = 2; // truecolour RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), '../.claude-plugin/icon.png');
writeFileSync(out, png);
console.log(`${out}  ${SIZE}x${SIZE}  ${(png.length / 1024).toFixed(1)} kB`);
console.log(`sha256 ${createHash('sha256').update(png).digest('hex')}`);
