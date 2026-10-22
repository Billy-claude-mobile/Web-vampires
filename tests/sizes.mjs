// Captures du menu et du jeu sur plusieurs formats d'écran.
// Usage : node tests/sizes.mjs [url] [dossier-captures]
import { devices } from 'playwright';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:8080/?debug';
const outDir = process.argv[3] ?? 'tests/screenshots';
const targets = {
  'iphone-se': devices['iPhone SE'],
  'pixel-7': devices['Pixel 7'],
  desktop: { viewport: { width: 1280, height: 720 } },
};

const browser = await launchBrowser();
for (const [name, device] of Object.entries(targets)) {
  const page = await (await browser.newContext(device)).newPage();
  await page.goto(url);
  await page.screenshot({ path: `${outDir}/size-${name}-menu.png` });
  await page.click('#play-btn');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/size-${name}-game.png` });
}
await browser.close();
