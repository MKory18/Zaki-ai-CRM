/**
 * The app's icons, from the one logo that already exists.
 *
 * Three files, because they answer different questions:
 *   192 / 512      — what the launcher shows.
 *   512 maskable   — what Android crops into whatever shape the phone uses.
 *                    It needs a safe margin: the logo drawn edge to edge
 *                    loses its fins to a circle mask.
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/logo.svg');
const OUT = 'public/icons';

// The system's own page colour, so the icon does not sit on a white square
// in a dark launcher.
const BG = { r: 0xf8, g: 0xfa, b: 0xfc, alpha: 1 };

async function plain(size) {
  await sharp(svg, { density: 400 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`${OUT}/icon-${size}.png`);
  console.log(`icon-${size}.png`);
}

async function maskable(size) {
  // 20% margin each side: Android crops up to ~10% and centres a circle.
  const inner = Math.round(size * 0.6);
  const logo = await sharp(svg, { density: 400 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/maskable-${size}.png`);
  console.log(`maskable-${size}.png`);
}

await plain(192);
await plain(512);
await maskable(512);
