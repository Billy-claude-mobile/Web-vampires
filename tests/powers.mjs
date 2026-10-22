// Vérifie l'effet réel de chaque pouvoir (partie et Crypte) dans des scénarios contrôlés.
// Usage : node tests/powers.mjs [url]
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:8080/?debug';
const browser = await launchBrowser();
const page = await browser.newPage();
await page.goto(url);

const results = await page.evaluate(async () => {
  const { Villager, Hunter, Bolt } = await import('/src/entities/humans.js');
  const { CONFIG } = await import('/src/config.js');
  const { META_UPGRADES } = await import('/src/meta.js');
  const game = window.__game;
  const dt = 1 / 60;
  let dir = { x: 0, y: 0 };
  Object.defineProperty(game.input, 'vector', { get: () => dir });
  game.audio.setMuted(true);
  game.ui.showLevelUp = () => {};
  game.ui.flashHint = () => {};
  game.ui.showGameOver = () => {};

  /** Nouvelle partie vide et figée : pas de spawn, pas de soif. */
  function fresh(upgrades = {}) {
    localStorage.removeItem('soif-de-sang');
    game.start();
    game.humans = [];
    game.elapsed = 0;
    game.nextBossAt = Infinity;
    for (const [id, n] of Object.entries(upgrades)) for (let i = 0; i < n; i++) {
      game.state = 'levelup';
      game.pendingLevelUps = 1;
      game.chooseUpgrade(id);
    }
    game.player.blood = 50;
    game.player.invuln = 0;
    dir = { x: 0, y: 0 };
    return game.player;
  }
  // Spawns désactivés pendant les tests
  const savedSpawn = { ...CONFIG.spawn };
  for (const k of ['villager', 'hunter', 'inquisitor']) CONFIG.spawn[k] = { target: () => 0, interval: 1 };
  const savedDrain = { ...CONFIG.drain };

  function step(seconds) {
    for (let t = 0; t < seconds; t += dt) {
      game.update(dt);
      if (game.state === 'levelup') game.state = 'playing';
    }
  }

  const out = [];
  const check = (name, ok, detail) => out.push({ pouvoir: name, ok: ok ? '✅' : '❌', détail: detail });
  const noDrain = () => Object.assign(CONFIG.drain, { base: 0, growth: 0, max: 0 });

  noDrain();

  // Morsure de référence
  let p = fresh();
  game.humans.push(new Villager(p.x + 5, p.y));
  let before = p.blood;
  step(dt);
  const biteGain = p.blood - before;
  check('Morsure (référence)', biteGain > 10, `+${biteGain.toFixed(1)} sang`);

  // Chauves-souris : la victime doit rendre du sang
  p = fresh({ bats: 1 });
  const bat = p.batPositions[0];
  const v = new Villager(bat.x, bat.y);
  v.update = () => {};
  game.humans.push(v);
  before = p.blood;
  step(dt);
  const batGain = p.blood - before;
  check('Nuée (chauve-souris)', v.dead && batGain >= biteGain * 0.5, `victime=${v.dead}, +${batGain.toFixed(1)} sang`);

  // Chauves-souris : bloquent les carreaux
  p = fresh({ bats: 1 });
  const b0 = p.batPositions[0];
  const bolt = new Bolt(b0.x, b0.y, 0);
  game.bolts.push(bolt);
  step(dt);
  check('Nuée (bloque les carreaux)', bolt.dead && p.blood === 50, `carreau détruit=${bolt.dead}`);

  // Onde sanguine
  p = fresh({ nova: 1 });
  const nv = new Villager(p.x + 80, p.y);
  nv.update = () => {};
  game.humans.push(nv);
  before = p.blood;
  step(1.1);
  const novaGain = p.blood - before;
  check('Onde sanguine', nv.dead && novaGain >= biteGain * 0.5, `victime=${nv.dead}, +${novaGain.toFixed(1)} sang`);

  // Vitesse
  p = fresh();
  dir = { x: 1, y: 0 };
  step(1);
  const baseDist = p.x;
  p = fresh({ speed: 1 });
  dir = { x: 1, y: 0 };
  step(1);
  check("Pas de l'ombre", p.x > baseDist * 1.08, `${baseDist.toFixed(0)} → ${p.x.toFixed(0)} px/s`);

  // Crocs : portée de morsure
  p = fresh();
  // Contact si distance < portée de morsure + rayon du villageois : on se place 6 px au-delà.
  const reach = p.biteRadius + CONFIG.villager.radius + 6;
  const far = new Villager(p.x + reach, p.y);
  far.update = () => {};
  game.humans.push(far);
  step(dt);
  const missed = !far.dead;
  p = fresh({ fangs: 1 });
  const far2 = new Villager(p.x + reach, p.y);
  far2.update = () => {};
  game.humans.push(far2);
  step(dt);
  check('Crocs acérés', missed && far2.dead, `hors portée sans=${missed}, mordu avec=${far2.dead}`);

  // Festin
  p = fresh({ feast: 1 });
  game.humans.push(new Villager(p.x + 5, p.y));
  before = p.blood;
  step(dt);
  check('Festin', p.blood - before > biteGain * 1.2, `+${(p.blood - before).toFixed(1)} (vs ${biteGain.toFixed(1)})`);

  // Soif maîtrisée
  Object.assign(CONFIG.drain, savedDrain);
  p = fresh();
  step(1);
  const lossBase = 50 - p.blood;
  p = fresh({ thirst: 1 });
  step(1);
  const lossThirst = 50 - p.blood;
  check('Soif maîtrisée', lossThirst < lossBase * 0.9, `perte/s ${lossBase.toFixed(2)} → ${lossThirst.toFixed(2)}`);
  noDrain();

  // Peau de pierre
  p = fresh({ armor: 1 });
  game.bolts.push(new Bolt(p.x - 10, p.y - p.radius, 0));
  step(0.1);
  check('Peau de pierre', Math.abs(50 - p.blood - CONFIG.hunter.boltDamage * 0.8) < 0.5, `dégâts=${(50 - p.blood).toFixed(1)} (normal ${CONFIG.hunter.boltDamage})`);

  // Lune rouge : durée de frénésie
  p = fresh({ moon: 1 });
  for (let i = 0; i < CONFIG.frenzy.comboStep; i++) {
    game.humans.push(new Villager(p.x + 5, p.y));
    step(dt);
  }
  check('Lune rouge', p.frenzy > CONFIG.frenzy.duration + 1.5, `frénésie=${p.frenzy.toFixed(2)}s (base ${CONFIG.frenzy.duration}s)`);

  // Hypnose
  p = fresh();
  let prey = new Villager(p.x + 100, p.y);
  prey.fleeJitter = 0;
  game.humans.push(prey);
  step(0.5);
  const fleeBase = prey.x - (p.x + 100);
  p = fresh({ hypnosis: 1 });
  prey = new Villager(p.x + 100, p.y);
  prey.fleeJitter = 0;
  game.humans.push(prey);
  step(0.5);
  const fleeHyp = prey.x - (p.x + 100);
  check('Hypnose', Math.abs(fleeHyp) < Math.abs(fleeBase) * 0.95, `fuite ${Math.abs(fleeBase).toFixed(0)} → ${Math.abs(fleeHyp).toFixed(0)} px`);

  // Les victimes des pouvoirs comptent dans le combo
  p = fresh({ bats: 1 });
  const cv = new Villager(p.batPositions[0].x, p.batPositions[0].y);
  cv.update = () => {};
  game.humans.push(cv);
  step(dt);
  check('Combo par les pouvoirs', game.combo === 1 && game.kills === 1, `combo=${game.combo}`);

  // Chasseur tué par une chauve-souris
  p = fresh({ bats: 1 });
  const hb = new Hunter(p.batPositions[0].x, p.batPositions[0].y);
  hb.update = () => {};
  game.humans.push(hb);
  before = p.blood;
  step(dt);
  check('Nuée sur chasseur', hb.dead && p.blood > before, `+${(p.blood - before).toFixed(1)} sang`);

  // Crypte : chaque amélioration permanente appliquée au départ
  for (const u of META_UPGRADES) {
    localStorage.setItem('soif-de-sang', JSON.stringify({ meta: { [u.id]: 1 } }));
    game.start();
    const r = game.run;
    const s = game.player.stats;
    const effects = {
      vitality: s.maxBlood === 110 && game.player.blood === 90,
      swiftness: Math.abs(s.speed - CONFIG.player.speed * 1.04) < 0.01,
      wisdom: Math.abs(s.xpGain - 1.1) < 1e-9,
      restraint: Math.abs(s.drain - 0.95) < 1e-9,
      destiny: r.rerolls === 1,
      familiar: s.bats === 1,
      coffin: r.revives === 1,
      greed: Math.abs(r.soulGain - 1.15) < 1e-9,
    };
    check(`Crypte : ${u.name}`, effects[u.id], JSON.stringify({ blood: game.player.blood, ...r, stats: undefined }).slice(0, 80));
  }

  // Cercueil : résurrection effective
  localStorage.setItem('soif-de-sang', JSON.stringify({ meta: { coffin: 1 } }));
  game.start();
  game.humans = [];
  game.player.blood = 1;
  game.bolts.push(new Bolt(game.player.x - 10, game.player.y - game.player.radius, 0));
  step(0.1);
  check('Crypte : résurrection', game.state === 'playing' && game.player.blood > 40, `état=${game.state}, sang=${game.player.blood.toFixed(0)}`);

  Object.assign(CONFIG.spawn, savedSpawn);
  Object.assign(CONFIG.drain, savedDrain);
  localStorage.removeItem('soif-de-sang');
  return out;
});

console.table(results);
if (results.some((r) => r.ok !== '✅')) process.exitCode = 1;
await browser.close();
