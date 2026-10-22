// Test d'équilibrage : un bot joue plusieurs parties en accéléré (simulation sans rendu)
// et affiche la durée de survie. Usage : node tests/balance.mjs [url] [parties]
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:8080/?debug';
const runs = Number(process.argv[3] ?? 8);

const browser = await launchBrowser();
const page = await browser.newPage();
await page.goto(url);

const results = await page.evaluate(async (runs) => {
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
    }
    out.push({
      bot: skill ? 'bon' : 'naïf',
      survie: Math.round(game.elapsed),
      score: game.score,
      victimes: game.kills,
      niveau: game.level,
      comboMax: game.bestCombo,
      cause: game.deathCause,
    });
  }
  return out;
}, runs);

console.table(results);
await browser.close();
