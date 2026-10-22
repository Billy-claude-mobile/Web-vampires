// Vérifie la progression après les boss : nouveaux ennemis, Menace et leurs mécaniques.
// Usage : node tests/progression.mjs [url]
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:8080/?debug';
const browser = await launchBrowser();
const page = await browser.newPage();
await page.goto(url);

const results = await page.evaluate(async () => {
  const { Hunter, Bolt } = await import('/src/entities/humans.js');
  const { Hound, GarlicCloud } = await import('/src/entities/elite.js');
  const { CONFIG } = await import('/src/config.js');
  const game = window.__game;
  const dt = 1 / 60;
  let dir = { x: 0, y: 0 };
  Object.defineProperty(game.input, 'vector', { get: () => dir });
  game.audio.setMuted(true);
  game.ui.showLevelUp = () => {};
  game.ui.showGameOver = () => {};
  localStorage.removeItem('soif-de-sang');

  const out = [];
  const check = (name, ok, detail) => out.push({ test: name, ok: ok ? '✅' : '❌', détail: detail });
  const keepAlive = () => { game.player.blood = game.player.maxBlood; };
  function step(seconds) {
    for (let t = 0; t < seconds; t += dt) {
      keepAlive();
      game.update(dt);
      if (game.state === 'levelup') game.state = 'playing';
    }
  }
  const kinds = () => game.humans.reduce((acc, h) => ({ ...acc, [h.kind]: (acc[h.kind] ?? 0) + 1 }), {});

  /** Fait apparaître le boss puis le tue par une morsure. */
  function killBoss() {
    game.nextBossAt = game.elapsed;
    step(dt * 2);
    const b = game.boss;
    b.hp = 0.5;
    b.attack = null;
    b.hitCooldown = 0;
    game.player.x = b.x;
    game.player.y = b.y;
    step(dt * 2);
    game.nextBossAt = Infinity;
  }

  // 1. Sans boss vaincu : aucun nouvel ennemi, même après longtemps
  game.start();
  game.nextBossAt = Infinity;
  step(200);
  let k = kinds();
  check('Aucun nouvel ennemi avant le 1er boss', !k.hound && !k.herbalist, JSON.stringify(k));

  // 2. Boss 1 → limiers
  killBoss();
  step(8);
  k = kinds();
  check('Boss 1 vaincu → limiers', game.bossesKilled === 1 && k.hound > 0 && !k.herbalist && game.threatLevel === 0, JSON.stringify(k));

  // 3. Boss 2 → herboristes
  killBoss();
  step(8);
  k = kinds();
  check('Boss 2 vaincu → herboristes', game.bossesKilled === 2 && k.herbalist > 0 && game.threatLevel === 0, JSON.stringify(k));

  // 4. Boss 3 et 4 → Menace 1 puis 2
  killBoss();
  const t1 = game.threat;
  check('Boss 3 vaincu → Menace 1', game.threatLevel === 1 && t1.speed > 1 && t1.damage > 1, JSON.stringify(t1));
  killBoss();
  check('Boss 4 vaincu → Menace 2', game.threatLevel === 2, `niveau=${game.threatLevel}`);
  game.ui.update(game, 0); // le HUD est normalement rafraîchi par la boucle d'affichage
  const hudThreat = document.getElementById('hud-threat');
  check('Indicateur de Menace dans le HUD', !hudThreat.classList.contains('hidden') && hudThreat.textContent.includes('2'), hudThreat.textContent.trim());

  /** Partie vide pour les mesures isolées. */
  function arena(threatLevel = 0) {
    game.start();
    game.nextBossAt = Infinity;
    game.threatLevel = threatLevel;
    for (const kd of Object.keys(CONFIG.spawn)) game.spawnCooldowns[kd] = Infinity;
    game.humans = [];
    game.player.invuln = 0;
    return game.player;
  }
  function measureHunterSpeed(level) {
    const p = arena(level);
    const h = new Hunter(p.x + 600, p.y);
    h.reload = Infinity;
    game.humans.push(h);
    step(0.5);
    return (p.x + 600 - h.x) / 0.5;
  }

  // 5. La Menace accélère les ennemis existants
  const v0 = measureHunterSpeed(0);
  const v2 = measureHunterSpeed(2);
  check('Menace : ennemis plus rapides', v2 > v0 * 1.12, `${v0.toFixed(0)} → ${v2.toFixed(0)} px/s`);

  // 6. La Menace augmente les dégâts
  function boltDamage(level) {
    const p = arena(level);
    p.blood = 100;
    game.bolts.push(new Bolt(p.x - 10, p.y - p.radius, 0));
    for (let t = 0; t < 0.1; t += dt) game.update(dt);
    return 100 - p.blood;
  }
  const d0 = boltDamage(0);
  const d2 = boltDamage(2);
  check('Menace : dégâts plus élevés', d2 > d0 * 1.2, `${d0.toFixed(1)} → ${d2.toFixed(1)}`);

  // Mesures isolées suivantes : sans soif, pour ne mesurer que les dégâts des ennemis
  const savedDrain = { ...CONFIG.drain };
  Object.assign(CONFIG.drain, { base: 0, growth: 0, max: 0 });

  // 7. Limier : son bond blesse, mais on peut le mordre hors bond
  let p = arena();
  let hound = new Hound(p.x + 150, p.y);
  hound.cooldown = 0;
  game.humans.push(hound);
  p.blood = 100;
  let sawCrouch = false;
  for (let t = 0; t < 1.5 && p.blood === 100; t += dt) {
    game.update(dt);
    sawCrouch ||= hound.state === 'crouch';
  }
  check('Limier : bond annoncé puis blessure', sawCrouch && Math.abs(100 - p.blood - CONFIG.hound.damage) < 0.5, `télégraphe=${sawCrouch}, dégâts=${(100 - p.blood).toFixed(1)}`);

  p = arena();
  hound = new Hound(p.x + 5, p.y);
  hound.update = () => {};
  game.humans.push(hound);
  p.blood = 50;
  game.update(dt);
  check('Limier : mordable hors bond', hound.dead && p.blood > 50, `sang +${(p.blood - 50).toFixed(1)}`);

  p = arena();
  hound = new Hound(p.x + 5, p.y);
  hound.state = 'lunge';
  hound.timer = 1;
  hound.update = () => {};
  game.humans.push(hound);
  p.frenzy = 3;
  p.blood = 50;
  game.update(dt);
  check('Limier : mordu en frénésie même en plein bond', hound.dead && p.blood >= 50, `mort=${hound.dead}`);

  // 8. Nuage d'ail : impact annoncé, puis ralentit et brûle
  p = arena();
  game.hazards.push(new GarlicCloud(p.x + 200, p.y, p.x, p.y));
  p.blood = 50;
  for (let t = 0; t < 0.5; t += dt) game.update(dt);
  const beforeImpact = p.blood;
  for (let t = 0; t < 1.5; t += dt) game.update(dt);
  const loss = beforeImpact - p.blood;
  check('Ail : rien avant l\'impact', beforeImpact === 50, `sang=${beforeImpact}`);
  check('Ail : brûle dans le nuage', loss > CONFIG.herbalist.cloud.dps * 0.8 * 0.9, `perte ${loss.toFixed(1)} en ~1 s`);
  dir = { x: 1, y: 0 };
  const x0 = p.x;
  game.update(dt);
  const slowSpeed = (p.x - x0) / dt;
  dir = { x: 0, y: 0 };
  check('Ail : ralentit', slowSpeed < CONFIG.player.speed * 0.7, `${slowSpeed.toFixed(0)} px/s (normal ${CONFIG.player.speed})`);
  Object.assign(CONFIG.drain, savedDrain);

  return out;
});

console.table(results);
if (results.some((r) => r.ok !== '✅')) process.exitCode = 1;
await browser.close();
