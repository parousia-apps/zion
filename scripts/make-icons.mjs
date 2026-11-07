// Fabrique les icônes de l'application à partir de scripts/icon.html.
// Usage : node scripts/make-icons.mjs <chemin de Chrome> <dossier où trouver puppeteer-core>
// (Chrome et puppeteer-core ne servent qu'ici : ils ne sont pas des dépendances du jeu.)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const [chrome, puppeteerDir] = process.argv.slice(2);
const puppeteer = createRequire(`${puppeteerDir}/`)('puppeteer-core');
const root = fileURLToPath(new URL('..', import.meta.url));

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 2 });
await page.goto(`file://${root}scripts/icon.html`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot({ type: 'png' });
await browser.close();

const out = `${root}public/icons`;
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
for (const size of [192, 512]) await sharp(png).resize(size, size).png().toFile(`${out}/icon-${size}.png`);
await sharp(png).resize(180, 180).png().toFile(`${out}/apple-touch-icon.png`);
console.log('icônes prêtes dans public/icons');
