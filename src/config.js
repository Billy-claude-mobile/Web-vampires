// Toutes les valeurs d'équilibrage du jeu sont centralisées ici.
export const CONFIG = {
  // Surface du monde visible à l'écran (en unités monde²), identique quel que soit l'appareil.
  viewArea: 480 * 700,

  player: {
    radius: 16,
    speed: 220,
    maxBlood: 100,
    startBlood: 80,
    invulnTime: 1.0,
  },

  // Perte de sang par seconde : base + croissance avec le temps (plafonnée).
  drain: { base: 3.6, growth: 0.04, max: 20 },

  bite: { comboWindow: 2.4, maxMultiplier: 8 },

  frenzy: { comboStep: 8, duration: 5, speedMult: 1.4 },

  // XP nécessaire pour passer du niveau n au niveau n+1.
  xpForLevel: (level) => Math.floor(4 + level * 3 + level * level * 0.2),

  villager: { radius: 12, wanderSpeed: 40, fleeSpeed: 112, fearRadius: 190, blood: 15, xp: 1, score: 10 },

  hunter: {
    radius: 13, speed: 95, blood: 24, xp: 3, score: 30,
    rangeMin: 150, rangeMax: 250,
    aimTime: 0.75, reloadMin: 2.2, reloadMax: 3.4,
    boltSpeed: 430, boltDamage: 20,
  },

  inquisitor: { radius: 16, speed: 105, speedGrowth: 0.25, contactDamage: 24, blood: 40, xp: 6, score: 80 },

  bats: { orbitRadius: 62, angularSpeed: 3.2, radius: 9, bloodFactor: 0.35 },

  nova: { baseCooldown: 6.5, cooldownStep: 0.9, minCooldown: 3.5, baseRadius: 125, radiusStep: 22 },

  // Population ciblée en fonction du temps écoulé (en secondes).
  spawn: {
    villagers: (t) => Math.min(9 + t * 0.08, 20),
    hunters: (t) => (t < 18 ? 0 : Math.min(1 + Math.floor((t - 18) / 18), 14)),
    inquisitors: (t) => (t < 50 ? 0 : Math.min(1 + Math.floor((t - 50) / 30), 8)),
  },

  storageKey: 'soif-de-sang',
};
