// Renders icons/icon.svg to the PNG sizes Chrome needs. Run: npm run icons
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../icons/', import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: `${dir}icon${size}.png`, omitBackground: true });
}
await browser.close();
