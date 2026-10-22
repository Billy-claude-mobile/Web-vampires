import { CONFIG } from './config.js';
import { formatTime } from './utils.js';
import { storage } from './storage.js';

const $ = (id) => document.getElementById(id);

const SCREENS = ['menu', 'levelup', 'pause', 'gameover'];
const TOUCH = window.matchMedia('(pointer: coarse)').matches;

/** Interface DOM : HUD, menus, choix d'améliorations, écran de fin. */
export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      bloodFill: $('blood-fill'),
      bloodBar: document.querySelector('.blood-bar'),
      xpFill: $('xp-fill'),
      level: $('level'),
      score: $('score'),
      combo: $('combo'),
      hint: $('hint'),
      cards: $('cards'),
    };
    this.lastCombo = 0;
    this.hintTimer = 0;
    this.tutorialStep = 0;
  }

  /** Lie les boutons aux actions du jeu. */
  bind(actions) {
    $('play-btn').addEventListener('click', actions.play);
    $('retry-btn').addEventListener('click', actions.play);
    $('pause-btn').addEventListener('click', actions.pause);
    $('resume-btn').addEventListener('click', actions.resume);
    $('quit-btn').addEventListener('click', actions.quit);
    $('mute-btn').addEventListener('click', actions.toggleMute);
  }

  #show(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    this.el.hud.classList.toggle('hidden', name === 'menu' || name === 'gameover');
  }

  showMenu() {
    $('menu-best').textContent = storage.load().best ?? 0;
    this.#show('menu');
  }

  showHud() {
    this.#show(null);
  }

  startRun() {
    this.tutorialStep = 0;
    this.lastCombo = 0;
    this.hintTimer = 0;
    this.showHud();
  }

  showPause() {
    this.#show('pause');
  }

  setMuteIcon(muted) {
    $('mute-btn').textContent = muted ? '🔇' : '🔊';
  }

  showLevelUp(choices, levels, onPick) {
    const { cards } = this.el;
    cards.innerHTML = '';
    // Verrou court : évite qu'un doigt encore posé valide une carte par erreur.
    cards.classList.add('locked');
    setTimeout(() => cards.classList.remove('locked'), 450);

    for (const u of choices) {
      const lvl = levels[u.id] ?? 0;
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.innerHTML = `
        <span class="card-icon">${u.icon}</span>
        <span>
          <span class="card-name">${u.name}</span><span class="card-lvl">${lvl === 0 ? 'NOUVEAU' : `Niv. ${lvl + 1}`}</span>
          <div class="card-desc">${u.desc(lvl)}</div>
        </span>`;
      btn.addEventListener('click', () => onPick(u.id), { once: true });
      cards.appendChild(btn);
    }
    this.#show('levelup');
  }

  showGameOver(game) {
    const data = storage.load();
    const best = data.best ?? 0;
    const isRecord = game.score > best;
    if (isRecord) storage.save({ best: game.score });

    $('go-title').textContent = isRecord ? 'Nouveau record !' : 'Tu es mort';
    $('go-cause').textContent = game.deathCause;
    $('go-score').textContent = game.score;
    $('go-time').textContent = formatTime(game.elapsed);
    $('go-kills').textContent = game.kills;
    $('go-best').textContent = isRecord ? '🏆 Record battu !' : `Record : ${best}`;

    // Laisse voir la mort une demi-seconde avant l'écran de fin.
    setTimeout(() => this.#show('gameover'), 600);
  }

  flashHint(text, duration) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    this.hintTimer = duration;
  }

  /** Mise à jour du HUD et du tutoriel contextuel, appelée chaque frame. */
  update(game, dt) {
    const p = game.player;
    const { el } = this;

    el.bloodFill.style.transform = `scaleX(${p.blood / p.maxBlood})`;
    el.bloodBar.classList.toggle('low', p.blood < 30);
    el.xpFill.style.transform = `scaleX(${game.xp / game.xpNeeded})`;
    el.level.textContent = `Niv. ${game.level}`;
    el.score.textContent = game.score;

    // Combo
    const frenzy = p.inFrenzy;
    if (frenzy) {
      el.combo.textContent = `FRÉNÉSIE ${p.frenzy.toFixed(1)}s`;
    } else if (game.frenzyCharge >= 2) {
      const step = CONFIG.frenzy.comboStep;
      const pips = '●'.repeat(game.frenzyCharge) + '○'.repeat(Math.max(0, step - game.frenzyCharge));
      el.combo.innerHTML = `Combo x${game.combo}<small>${pips} frénésie${game.comboMultiplier > 1 ? `  •  score x${game.comboMultiplier}` : ''}</small>`;
    }
    el.combo.classList.toggle('show', frenzy || game.frenzyCharge >= 2);
    el.combo.classList.toggle('frenzy', frenzy);
    if (game.combo > this.lastCombo) {
      el.combo.classList.remove('bump');
      void el.combo.offsetWidth; // relance l'animation
      el.combo.classList.add('bump');
    }
    this.lastCombo = game.combo;

    this.#updateTutorial(game, dt);
  }

  #updateTutorial(game, dt) {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove('show');
      return;
    }
    const steps = [
      { text: TOUCH ? '👆 Glisse ton doigt pour bouger' : '⌨️ Flèches ou ZQSD pour bouger', done: () => game.input.touchedOnce || game.player.moving },
      { text: '🧛 Fonce sur les villageois pour les mordre !', done: () => game.kills > 0 },
      { text: `🩸 Enchaîne ${CONFIG.frenzy.comboStep} morsures pour la frénésie`, done: () => game.kills >= 3 },
    ];
    const step = steps[this.tutorialStep];
    if (!step) return;
    if (step.done()) {
      this.tutorialStep += 1;
      this.el.hint.classList.remove('show');
      if (this.tutorialStep === 2) this.flashHint(steps[2].text, 3);
    } else if (this.tutorialStep < 2) {
      this.el.hint.textContent = step.text;
      this.el.hint.classList.add('show');
    }
  }
}
