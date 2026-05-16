// Generates PWA icons from the favicon SVG.
// Run: node scripts/generate-icons.mjs

import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'public')

// Wrap the logo SVG in a square container with a white background and padding
const logoSvg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8')

function makeSquareSvg(size) {
  const padding = Math.round(size * 0.15)
  const logoSize = size - padding * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#ffffff"/>
  <svg x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" viewBox="0 0 48 46">
    ${logoSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </svg>
</svg>`
}

const icons = [
  { name: 'pwa-192x192.png',      size: 192 },
  { name: 'pwa-512x512.png',      size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

mkdirSync(publicDir, { recursive: true })

for (const { name, size } of icons) {
  const svg = makeSquareSvg(size)
  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, name))
  console.log(`✓ ${name}`)
}

console.log('Done.')
