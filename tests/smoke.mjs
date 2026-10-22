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

// Compteur d'âmes du HUD : doit refléter les âmes accumulées dans la partie.
await page.evaluate(() => { window.__game.elapsed += 40; });
await page.waitForTimeout(200);
const soulsHud = await page.evaluate(() => ({ hud: Number(document.getElementById('hud-souls-count').textContent), game: window.__game.souls }));
console.log('Âmes HUD :', soulsHud);
if (soulsHud.hud !== soulsHud.game || soulsHud.game <= 0) {
  console.error('Compteur d\'âmes incorrect');
  process.exitCode = 1;
}

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

// Boss 1 : le Grand Chasseur, capturé pendant le télégraphe de son attaque.
async function bossShot(index, file) {
  await page.evaluate((i) => {
    const g = window.__game;
    g.boss = null;
    g.bossesSpawned = i;
    g.nextBossAt = g.elapsed;
    g.player.blood = 100;
    g.player.frenzy = 0;
  }, index);
  await page.waitForFunction(() => window.__game.boss?.attack?.telegraph > 0.2, null, { timeout: 15000 });
  await page.evaluate(() => { window.__game.player.blood = 100; });
  await page.screenshot({ path: `${outDir}/${file}` });
  const name = await page.evaluate(() => window.__game.boss.name);
  console.log('Boss visible :', name);
}
// Garde le joueur en vie pendant les captures de boss.
await page.evaluate(() => { window.__keepAlive = setInterval(() => { window.__game.player.blood = 100; }, 100); });
await bossShot(0, '6b-boss-hunter.png');
await bossShot(1, '6c-boss-inquisitor.png');
await page.waitForFunction(() => window.__game.zones.length > 0, null, { timeout: 15000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/6d-holy-zones.png` });

// Le boss perd des PV et donne une montée de niveau à sa mort.
const bossKill = await page.evaluate(() => {
  const g = window.__game;
  g.player.blood = 100;
  g.boss.hp = 0.5;
  g.player.x = g.boss.x;
  g.player.y = g.boss.y;
  g.boss.hitCooldown = 0;
  g.boss.attack = null;
  return true;
});
await page.waitForFunction(() => window.__game.bossesKilled === 1, null, { timeout: 5000 });
console.log('Boss vaincu :', bossKill);
await page.waitForSelector('#levelup:not(.hidden) .card');
await page.waitForTimeout(500);
await page.tap('.card');

await page.evaluate(() => clearInterval(window.__keepAlive));

// Mort par soif : l'écran de fin doit apparaître.
await page.evaluate(() => { const p = window.__game.player; p.frenzy = 0; p.blood = 0.01; });
await page.waitForSelector('#gameover:not(.hidden)', { timeout: 3000 });
await page.screenshot({ path: `${outDir}/7-gameover.png` });
const souls = await page.evaluate(() => ({ gagnées: window.__game.soulsEarned, hud: Number(document.getElementById('hud-souls-count').textContent), écranFin: Number(document.getElementById('go-souls').textContent) }));
console.log('Âmes gagnées :', souls);
if (souls.gagnées !== souls.hud || souls.gagnées !== souls.écranFin) {
  console.error('Âmes du HUD et de fin de partie différentes');
  process.exitCode = 1;
}

// Crypte : achat d'une amélioration permanente.
await page.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('soif-de-sang') ?? '{}');
  localStorage.setItem('soif-de-sang', JSON.stringify({ ...data, souls: 400 }));
});
await page.tap('#go-crypt-btn');
await page.tap('.price-btn');
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/8-crypt.png` });
const bought = await page.evaluate(() => JSON.parse(localStorage.getItem('soif-de-sang')).meta);
console.log('Achats Crypte :', bought);
await page.tap('#shop-back');

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
