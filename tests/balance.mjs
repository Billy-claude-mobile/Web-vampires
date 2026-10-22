// Test d'équilibrage : un bot joue plusieurs parties en accéléré (simulation sans rendu)
// et affiche la durée de survie. Usage : node tests/balance.mjs [url] [parties]
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:8080/?debug';
const runs = Number(process.argv[3] ?? 8);
const trace = process.argv.includes('--trace');

const browser = await launchBrowser();
const page = await browser.newPage();
await page.goto(url);
// --meta : simule un joueur ayant acheté la moitié des améliorations de la Crypte.
if (process.argv.includes('--meta')) {
  await page.evaluate(() => {
    localStorage.setItem('soif-de-sang', JSON.stringify({
      meta: { vitality: 3, swiftness: 2, wisdom: 2, restraint: 2, destiny: 1, familiar: 1, coffin: 1, greed: 2 },
    }));
  });
  await page.reload();
}

const { out: results, lines } = await page.evaluate(async ({ runs, trace }) => {
  const game = window.__game;
  const dt = 1 / 60;
  let botDir = { x: 0, y: 0 };
  Object.defineProperty(game.input, 'vector', { get: () => botDir });
  game.audio.setMuted(true);

  /** Bot simple : esquive les tirs et les inquisiteurs, puis chasse la proie la plus proche. */
  function think(skill) {
    const p = game.player;
    let fx = 0;
    let fy = 0;
    for (const h of game.humans) {
      const dx = h.x - p.x;
      const dy = h.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (h.holy && !p.inFrenzy) {
        if (d < 200) { fx -= (dx / d) * 4; fy -= (dy / d) * 4; }
      } else if (h.aiming > 0 && skill > 0.5) {
        // Perpendiculaire à la ligne de visée.
        const ax = Math.cos(h.aimAngle);
        const ay = Math.sin(h.aimAngle);
        const side = Math.sign(ax * (p.y - h.y) - ay * (p.x - h.x)) || 1;
        fx += -ay * side * 6;
        fy += ax * side * 6;
      }
    }
    // Cercles sacrés à éviter
    for (const z of game.zones) {
      const dx = z.x - p.x;
      const dy = z.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (z.delay > 0 && d < z.radius + 30 && skill > 0.5) { fx -= (dx / d) * 8; fy -= (dy / d) * 8; }
    }
    // Boss : on fonce dessus entre ses attaques, on s'écarte quand il attaque.
    const boss = game.boss;
    if (boss) {
      const dx = boss.x - p.x;
      const dy = boss.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (boss.attack && skill > 0.5) {
        fx -= (-dy / d) * 5;
        fy -= (dx / d) * 5;
      } else if (p.blood > 35) {
        // Assez de sang : on se concentre sur le boss.
        const len = Math.hypot(fx, fy) || 1;
        botDir = { x: (fx / len) * 0.3 + dx / d, y: (fy / len) * 0.3 + dy / d };
        return;
      }
    }
    const prey = game.humans
      .filter((h) => h.canBeBitten(p))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (prey) {
      const d = Math.hypot(prey.x - p.x, prey.y - p.y) || 1;
      fx += (prey.x - p.x) / d;
      fy += (prey.y - p.y) / d;
    }
    const len = Math.hypot(fx, fy) || 1;
    botDir = { x: fx / len, y: fy / len };
  }

  const out = [];
  const lines = [];
  for (let i = 0; i < runs; i++) {
    const skill = i % 2 === 0 ? 1 : 0; // alterne bot « bon » et bot « naïf »
    game.start();
    let frames = 0;
    while (game.state !== 'over' && game.elapsed < 900) {
      if (frames++ % 6 === 0) think(skill);
      if (game.state === 'levelup') {
        const choices = [...document.querySelectorAll('.card')];
        choices[Math.floor(Math.random() * choices.length)].click();
        // le clic est verrouillé visuellement mais le handler est direct
      }
      game.update(dt);
      if (trace && i === 0 && frames % 60 === 0 && game.elapsed > 60) {
        const b = game.boss;
        lines.push(`${game.elapsed.toFixed(0)}s sang=${game.player.blood.toFixed(0)} drain=${game.drainRate.toFixed(1)} humains=${game.humans.length} boss=${b ? `${b.hp.toFixed(1)} ${b.attack?.name ?? '-'}` : '-'}`);
      }
    }
    out.push({
      bot: skill ? 'bon' : 'naïf',
      survie: Math.round(game.elapsed),
      score: game.score,
      victimes: game.kills,
      niveau: game.level,
      boss: `${game.bossesKilled}/${game.bossesSpawned}`,
      âmes: game.soulsEarned,
      comboMax: game.bestCombo,
      cause: game.deathCause,
    });
  }
  return { out, lines };
}, { runs, trace });

if (trace) console.log(lines.join('\n'));
console.table(results);
await browser.close();
