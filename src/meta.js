import { storage } from './storage.js';

/**
 * Progression permanente : des « âmes » gagnées à chaque partie s'échangent
 * contre des améliorations définitives dans la Crypte.
 * Pour en ajouter une : un objet { id, icon, name, max, desc, cost(level), apply(run) }.
 * `run` contient les stats du joueur et les ressources de la partie (relances, résurrections…).
 */
export const META_UPGRADES = [
  {
    id: 'vitality',
    icon: '🩸',
    name: 'Sang ancien',
    max: 5,
    desc: '+10 de sang maximum et de départ',
    cost: (lvl) => 30 + lvl * 30,
    apply: (run) => { run.stats.maxBlood += 10; run.startBlood += 10; },
  },
  {
    id: 'swiftness',
    icon: '💨',
    name: 'Ailes de nuit',
    max: 5,
    desc: '+4% de vitesse',
    cost: (lvl) => 40 + lvl * 35,
    apply: (run) => { run.stats.speed *= 1.04; },
  },
  {
    id: 'wisdom',
    icon: '📜',
    name: 'Mémoire des siècles',
    max: 5,
    desc: '+10% d\'expérience',
    cost: (lvl) => 40 + lvl * 40,
    apply: (run) => { run.stats.xpGain *= 1.1; },
  },
  {
    id: 'restraint',
    icon: '⏳',
    name: 'Jeûne millénaire',
    max: 4,
    desc: 'La jauge se vide 5% moins vite',
    cost: (lvl) => 60 + lvl * 50,
    apply: (run) => { run.stats.drain *= 0.95; },
  },
  {
    id: 'destiny',
    icon: '🎲',
    name: 'Destin',
    max: 3,
    desc: '+1 relance des pouvoirs par partie',
    cost: (lvl) => 50 + lvl * 60,
    apply: (run) => { run.rerolls += 1; },
  },
  {
    id: 'familiar',
    icon: '🦇',
    name: 'Familier',
    max: 1,
    desc: 'Commence chaque partie avec une chauve-souris',
    cost: () => 150,
    apply: (run) => { run.startUpgrades.push('bats'); },
  },
  {
    id: 'coffin',
    icon: '⚰️',
    name: 'Cercueil',
    max: 2,
    desc: 'Ressuscite une fois par partie à 50% de sang',
    cost: (lvl) => 250 + lvl * 250,
    apply: (run) => { run.revives += 1; },
  },
  {
    id: 'greed',
    icon: '👻',
    name: 'Avarice',
    max: 4,
    desc: '+15% d\'âmes gagnées',
    cost: (lvl) => 50 + lvl * 50,
    apply: (run) => { run.soulGain *= 1.15; },
  },
];

/** Âmes gagnées à la fin d'une partie. */
export function soulsForRun({ kills, elapsed, bossesKilled }, soulGain = 1) {
  return Math.floor((kills / 3 + elapsed / 8 + bossesKilled * 25) * soulGain);
}

export const meta = {
  get souls() {
    return storage.load().souls ?? 0;
  },

  get levels() {
    return storage.load().meta ?? {};
  },

  level(id) {
    return this.levels[id] ?? 0;
  },

  /** Prix du prochain niveau, ou null si maximisé. */
  price(upgrade) {
    const lvl = this.level(upgrade.id);
    return lvl >= upgrade.max ? null : upgrade.cost(lvl);
  },

  buy(id) {
    const upgrade = META_UPGRADES.find((u) => u.id === id);
    const price = this.price(upgrade);
    if (price === null || this.souls < price) return false;
    storage.save({ souls: this.souls - price, meta: { ...this.levels, [id]: this.level(id) + 1 } });
    return true;
  },

  addSouls(amount) {
    storage.save({ souls: this.souls + amount });
  },

  /** Applique toutes les améliorations achetées à une nouvelle partie. */
  applyTo(run) {
    for (const u of META_UPGRADES) {
      for (let i = 0; i < this.level(u.id); i++) u.apply(run);
    }
    return run;
  },
};
