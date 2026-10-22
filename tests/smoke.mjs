// Test de fumée : charge le jeu en émulation mobile, joue quelques secondes, capture l'écran.
// Usage : npx http-server -p 8080 . & node tests/smoke.mjs [url] [dossier-captures]
import { devices } from 'playwright';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:8080/?debug';
const outDir = process.argv[3] ?? 'tests/screenshots';

const browser = await launchBrowser();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url);
await page.screenshot({ path: `${outDir}/1-menu.png` });

await page.tap('#play-btn');
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/2-start.png` });

// Glisse le doigt vers un villageois proche via le joystick virtuel (événements pointer).
const center = { x: 195, y: 500 };
await page.mouse.move(center.x, center.y);
await page.mouse.down();
for (let i = 0; i < 40; i++) {
  const target = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    const prey = g.humans.filter((h) => !h.holy).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (!prey) return { x: 0, y: 0 };
    const d = Math.hypot(prey.x - p.x, prey.y - p.y) || 1;
    return { x: (prey.x - p.x) / d, y: (prey.y - p.y) / d };
  });
  await page.mouse.move(center.x + target.x * 50, center.y + target.y * 50);
  await page.waitForTimeout(100);
  if (i === 20) await page.screenshot({ path: `${outDir}/3-drag.png` });
}
await page.mouse.up();

const state = await page.evaluate(() => {
  const g = window.__game;
  return { state: g.state, kills: g.kills, blood: Math.round(g.player.blood), score: g.score, level: g.level };
});
console.log('État après 4s de jeu :', state);
await page.screenshot({ path: `${outDir}/4-after.png` });

// Montée de niveau forcée : les cartes doivent s'afficher puis être cliquables.
await page.evaluate(() => { window.__game.pendingLevelUps = 1; });
await page.waitForSelector('#levelup:not(.hidden) .card');
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/5-levelup.png` });
await page.tap('.card');
const afterPick = await page.evaluate(() => ({ state: window.__game.state, levels: window.__game.upgradeLevels }));
console.log('Après choix :', afterPick);

// Fait avancer le temps pour voir chasseurs, inquisiteurs, chauves-souris et frénésie.
await page.evaluate(() => {
  const g = window.__game;
  g.elapsed = 75;
  g.player.stats.bats = 3;
  g.player.blood = 100;
  g.player.frenzy = 8;
  g.combo = 7;
  g.frenzyCharge = 7;
});
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.player.blood = 100; });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/6-late.png` });

// Mort par soif : l'écran de fin doit apparaître.
await page.evaluate(() => { const p = window.__game.player; p.frenzy = 0; p.blood = 0.01; });
await page.waitForSelector('#gameover:not(.hidden)', { timeout: 3000 });
await page.screenshot({ path: `${outDir}/7-gameover.png` });

// Rejouer relance une partie propre.
await page.tap('#retry-btn');
const restarted = await page.evaluate(() => ({ state: window.__game.state, score: window.__game.score }));
console.log('Après rejouer :', restarted);
if (restarted.state !== 'playing' || afterPick.state !== 'playing') {
  console.error('Flux de jeu incorrect');
  process.exitCode = 1;
}

if (errors.length) {
  console.error('Erreurs JS :', errors);
  process.exitCode = 1;
}
await browser.close();
