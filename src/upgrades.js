import { shuffle } from './utils.js';

/**
 * Pouvoirs proposés à chaque montée de niveau.
 * Pour en ajouter un : un objet { id, icon, name, max, desc(level), apply(stats) }.
 */
export const UPGRADES = [
  {
    id: 'bats',
    icon: '🦇',
    name: 'Nuée',
    max: 4,
    desc: (lvl) => (lvl === 0
      ? 'Une chauve-souris tourne autour de toi, mord les humains et bloque les carreaux'
      : '+1 chauve-souris en orbite'),
    apply: (s) => { s.bats += 1; },
  },
  {
    id: 'nova',
    icon: '💥',
    name: 'Onde sanguine',
    max: 5,
    desc: (lvl) => (lvl === 0
      ? 'Une explosion de sang tue régulièrement les humains proches'
      : 'Onde plus fréquente et plus large'),
    apply: (s) => { s.nova += 1; },
  },
  {
    id: 'speed',
    icon: '💨',
    name: "Pas de l'ombre",
    max: 5,
    desc: () => '+10% de vitesse de déplacement',
    apply: (s) => { s.speed *= 1.1; },
  },
  {
    id: 'fangs',
    icon: '🦷',
    name: 'Crocs acérés',
    max: 4,
    desc: () => '+12 de portée de morsure',
    apply: (s) => { s.biteRange += 12; },
  },
  {
    id: 'feast',
    icon: '🍷',
    name: 'Festin',
    max: 4,
    desc: () => '+25% de sang par victime',
    apply: (s) => { s.bloodGain *= 1.25; },
  },
  {
    id: 'thirst',
    icon: '⏳',
    name: 'Soif maîtrisée',
    max: 3,
    desc: () => 'Ta jauge de sang se vide 12% moins vite',
    apply: (s) => { s.drain *= 0.88; },
  },
  {
    id: 'armor',
    icon: '🛡️',
    name: 'Peau de pierre',
    max: 3,
    desc: () => '-20% de dégâts subis',
    apply: (s) => { s.armor *= 0.8; },
  },
  {
    id: 'moon',
    icon: '🌕',
    name: 'Lune rouge',
    max: 3,
    desc: () => 'La frénésie dure 2 s de plus',
    apply: (s) => { s.frenzyBonus += 2; },
  },
  {
    id: 'hypnosis',
    icon: '👁️',
    name: 'Hypnose',
    max: 3,
    desc: () => 'Les humains fuient 12% moins vite',
    apply: (s) => { s.preySlow *= 0.88; },
  },
];

/** Statistiques modifiables du joueur, réinitialisées à chaque partie. */
export function baseStats({ speed, maxBlood }) {
  return { speed, maxBlood, xpGain: 1, biteRange: 6, bloodGain: 1, drain: 1, armor: 1, bats: 0, nova: 0, frenzyBonus: 0, preySlow: 1 };
}

/** Tire `count` améliorations non maximisées. */
export function rollUpgrades(levels, count = 3) {
  const available = UPGRADES.filter((u) => (levels[u.id] ?? 0) < u.max);
  return shuffle([...available]).slice(0, count);
}
