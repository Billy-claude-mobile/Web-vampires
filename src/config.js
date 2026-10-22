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
  drain: { base: 3.6, growth: 0.04, max: 40 },

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

  // Débloqués après les boss (voir progression)
  hound: {
    radius: 11, speed: 140, blood: 10, xp: 2, score: 25, damage: 16,
    lungeRange: 190, crouchTime: 0.55, lungeSpeed: 520, lungeTime: 0.35, recoverTime: 0.8, cooldown: 1.8,
  },
  herbalist: {
    radius: 12, speed: 70, blood: 18, xp: 3, score: 35,
    rangeMin: 170, rangeMax: 280, throwMin: 3.8, throwMax: 5.2, windup: 0.4, flightTime: 0.9,
    cloud: { radius: 62, duration: 4, dps: 9, slow: 0.6 },
  },

  /**
   * Progression après chaque boss vaincu :
   * - les premiers boss débloquent chacun un nouvel ennemi (unlocks, dans l'ordre) ;
   * - les suivants augmentent la « Menace » : chaque niveau ajoute ces bonus aux humains hostiles.
   */
  progression: {
    unlocks: ['hound', 'herbalist'],
    threatPerLevel: { speed: 0.08, damage: 0.15, fireRate: 0.12, spawn: 0.15 },
  },

  // bloodFactor : part du sang d'une morsure rendue par une victime de ce pouvoir.
  // repel / stun : recul et étourdissement infligés aux inquisiteurs touchés par une chauve-souris.
  bats: { orbitRadius: 62, angularSpeed: 3.2, radius: 9, bloodFactor: 0.8, repel: 45, stun: 0.9 },

  nova: { bloodFactor: 0.8, baseCooldown: 6.5, cooldownStep: 0.9, minCooldown: 3.5, baseRadius: 125, radiusStep: 22 },

  bosses: {
    firstAt: 70, // secondes avant le premier boss
    interval: 95, // délai entre la mort d'un boss et l'arrivée du suivant
    warning: 3,
    biteDamage: 1,
    frenzyBiteDamage: 2,
    biteBlood: 6,
    batDamage: 0.4,
    novaDamage: 2,
    hitCooldown: 0.45,
    knockback: 320,
    reward: { blood: 60, score: 500 },
    holyZone: { radius: 52, delay: 1.1, damage: 24 },
    grandHunter: { name: 'Le Grand Chasseur', radius: 24, hp: 11, hpPerTier: 7, speed: 115, dashSpeed: 640, dashDamage: 30, rest: 1.3 },
    grandInquisitor: { name: 'Le Grand Inquisiteur', radius: 24, hp: 14, hpPerTier: 7, speed: 70, rest: 1.2 },
  },

  // Population par type : effectif ciblé selon le temps (s) et délai minimal entre deux apparitions.
  spawn: {
    // Le village se vide peu à peu après 4 minutes : la fin de partie devient une course.
    villager: { target: (t) => (t < 240 ? Math.min(9 + t * 0.08, 20) : Math.max(20 - (t - 240) / 25, 6)), interval: 0.45 },
    hunter: { target: (t) => (t < 18 ? 0 : Math.min(1 + Math.floor((t - 18) / 18), 14)), interval: 1.5 },
    inquisitor: { target: (t) => (t < 50 ? 0 : Math.min(1 + Math.floor((t - 50) / 30), 8)), interval: 2.5 },
    // Ennemis débloqués : t = secondes écoulées depuis leur déblocage.
    hound: { unlock: true, target: (t) => Math.min(2 + Math.floor(t / 25), 8), interval: 2.5 },
    herbalist: { unlock: true, target: (t) => Math.min(1 + Math.floor(t / 35), 5), interval: 4 },
  },

  storageKey: 'soif-de-sang',
};
