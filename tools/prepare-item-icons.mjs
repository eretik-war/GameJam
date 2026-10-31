import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { root } from './build.mjs';

/**
 * Deterministic icon preparation for the four module items.
 * Source PNGs are the user's files (transparent background, RGBA, 8 bit, not interlaced).
 * Every icon becomes 128x128 with a 4 px margin, matching the four lens icons.
 */
const ICON_SIZE = 128;
const MARGIN = 4;
const items = [
  { name: 'magenta', source: 'versions/0.1.0/dev-support/art/items/modules/module-magenta.png' },
  { name: 'gold', source: 'versions/0.1.0/dev-support/art/items/modules/module-gold.png' },
  { name: 'blue', source: 'versions/0.1.0/dev-support/art/items/modules/module-blue.png' },
  { name: 'teal', source: 'versions/0.1.0/dev-support/art/items/modules/module-teal.png' },
].map(item => ({ ...item, output: `assets/images/items/item-module-${item.name}.png` }));

function decodePng(file) {
  const bytes = readFileSync(file);
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const chunks = [];
  while (pos < bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString('ascii', pos + 4, pos + 8);
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }
  if (depth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`Unsupported PNG: ${file}`);
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? current[x - 4] : 0, up = previous[x], corner = x >= 4 ? previous[x - 4] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - corner;
        const a = Math.abs(estimate - left), b = Math.abs(estimate - up), c = Math.abs(estimate - corner);
        value += a <= b && a <= c ? left : b <= c ? up : corner;
      }
      current[x] = value & 255;
    }
    current.copy(pixels, y * stride); previous = current;
  }
  return { width, height, pixels };
}

function contentBox({ width, height, pixels }) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] === 0) continue;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
  }
  if (right < 0) throw new Error('Empty image');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Box downscale in premultiplied space: keeps the outline antialiasing clean. */
function resize(image, box, targetWidth, targetHeight) {
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const y0 = box.y + (y * box.height) / targetHeight, y1 = box.y + ((y + 1) * box.height) / targetHeight;
    for (let x = 0; x < targetWidth; x++) {
      const x0 = box.x + (x * box.width) / targetWidth, x1 = box.x + ((x + 1) * box.width) / targetWidth;
      let r = 0, g = 0, b = 0, a = 0, weight = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const overlapY = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (overlapY <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const overlapX = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (overlapX <= 0) continue;
          const w = overlapX * overlapY, offset = (sy * image.width + sx) * 4;
          const alpha = image.pixels[offset + 3] / 255;
          r += image.pixels[offset] * alpha * w; g += image.pixels[offset + 1] * alpha * w;
          b += image.pixels[offset + 2] * alpha * w; a += image.pixels[offset + 3] * w; weight += w;
        }
      }
      const offset = (y * targetWidth + x) * 4;
      const cover = a / (weight * 255);
      out[offset + 3] = Math.round(a / weight);
      if (cover > 0) {
        out[offset] = Math.round(r / (weight * cover)); out[offset + 1] = Math.round(g / (weight * cover));
        out[offset + 2] = Math.round(b / (weight * cover));
      }
    }
  }
  return out;
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ 0xffffffff;
}

const report = [];
for (const item of items) {
  const source = path.join(root, item.source);
  const image = decodePng(source);
  const box = contentBox(image);
  const scale = (ICON_SIZE - MARGIN * 2) / Math.max(box.width, box.height);
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const body = resize(image, box, width, height);
  // Fully covered pixels become opaque; the antialiased outline keeps its own alpha.
  for (let i = 3; i < body.length; i += 4) if (body[i] >= 240) body[i] = 255;
  const canvas = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  const left = Math.floor((ICON_SIZE - width) / 2), top = Math.floor((ICON_SIZE - height) / 2);
  for (let y = 0; y < height; y++) body.copy(canvas, ((top + y) * ICON_SIZE + left) * 4, y * width * 4, (y + 1) * width * 4);
  const png = encodePng(ICON_SIZE, ICON_SIZE, canvas);
  const target = path.join(root, item.output);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, png);
  report.push({ name: item.name, source: item.source, output: item.output, sourceSize: { width: image.width, height: image.height },
    crop: box, icon: { width: ICON_SIZE, height: ICON_SIZE, margin: MARGIN, content: { width, height, left, top } },
    bytes: png.length, sha256: createHash('sha256').update(png).digest('hex') });
}
const manifestPath = path.join(root, 'versions/0.1.0/dev-support/art/items/modules-extraction.json');
await fs.writeFile(manifestPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ prepared: report.length, size: ICON_SIZE, manifest: path.relative(root, manifestPath) }));
