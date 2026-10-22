import { CONFIG } from './config.js';
import { Player } from './entities/player.js';
import { Bolt, Hunter, Inquisitor, Villager } from './entities/humans.js';
import { Fx } from './fx.js';
import { UPGRADES, rollUpgrades } from './upgrades.js';
import { dirTo, dist, rand } from './utils.js';

/** États possibles de la partie. */
export const State = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  LEVEL_UP: 'levelup',
  PAUSED: 'paused',
  OVER: 'over',
});

/** Logique de jeu : simulation, règles, progression. Aucun rendu ici. */
export class Game {
  constructor({ input, audio, ui }) {
    this.input = input;
    this.audio = audio;
    this.ui = ui;
    this.fx = new Fx();
    this.state = State.MENU;
    this.view = { hw: 300, hh: 400 }; // demi-dimensions visibles, mises à jour par le renderer
    this.camera = { x: 0, y: 0 };
    this.reset();
  }

  reset() {
    this.player = new Player();
    this.humans = [];
    this.bolts = [];
    this.fx.clear();
    this.camera = { x: 0, y: 0 };
    this.elapsed = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.frenzyCharge = 0;
    this.level = 1;
    this.xp = 0;
    this.pendingLevelUps = 0;
    this.upgradeLevels = {};
    this.seen = { hunter: false, inquisitor: false };
    this.deathCause = '';
    this.#spawnInitialVillagers();
  }

  start() {
    this.reset();
    this.state = State.PLAYING;
    this.input.enabled = true;
  }

  get xpNeeded() {
    return CONFIG.xpForLevel(this.level);
  }

  get drainRate() {
    const d = CONFIG.drain;
    return Math.min(d.base + d.growth * this.elapsed, d.max) * this.player.stats.drain;
  }

  get comboMultiplier() {
    return Math.min(1 + Math.floor(this.combo / 4), CONFIG.bite.maxMultiplier);
  }

  get viewRadius() {
    return Math.hypot(this.view.hw, this.view.hh);
  }

  isOnScreen(e, margin = 0) {
    return Math.abs(e.x - this.camera.x) < this.view.hw - margin
      && Math.abs(e.y - this.camera.y) < this.view.hh - margin;
  }

  // ---------------------------------------------------------------- Boucle

  update(dt) {
    if (this.state !== State.PLAYING) return;
    const p = this.player;
    this.elapsed += dt;

    p.update(dt, this);
    this.#updateCamera(dt);

    if (!p.inFrenzy) {
      p.blood -= this.drainRate * dt;
      if (p.blood <= 0) return this.#die('Ta soif t\'a consumé…');
    }

    this.#spawn();
    for (const h of this.humans) h.update(dt, this);
    for (const b of this.bolts) b.update(dt);

    this.#resolveBites();
    this.#resolveBats();
    this.#resolveNova(dt);
    this.#resolveBolts();
    if (this.state === State.OVER) return;

    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.combo = 0;
      this.frenzyCharge = 0;
    }

    this.#cleanup();
    this.fx.update(dt);

    if (this.pendingLevelUps > 0) this.#openLevelUp();
  }

  // ---------------------------------------------------------------- Combat

  #resolveBites() {
    const p = this.player;
    for (const h of this.humans) {
      if (h.dead || dist(p, h) > p.biteRadius + h.radius) continue;
      if (h.canBeBitten(p)) {
        this.#kill(h, 'bite');
      } else {
        // Contact avec un inquisiteur : dégâts + repousse.
        this.#hurt(h.cfg.contactDamage, 'Purifié par un inquisiteur');
        const d = dirTo(p, h);
        h.x += d.x * 40;
        h.y += d.y * 40;
        h.stun = 0.8;
      }
    }
  }

  #resolveBats() {
    const p = this.player;
    if (p.stats.bats === 0) return;
    const reach = CONFIG.bats.radius;
    for (const bat of p.batPositions) {
      for (const h of this.humans) {
        if (!h.dead && !h.holy && dist(bat, h) < reach + h.radius) this.#kill(h, 'bat');
      }
      for (const b of this.bolts) {
        if (!b.dead && dist(bat, b) < reach + 8) {
          b.dead = true;
          this.fx.sparks(b.x, b.y, '#d8c3a0');
        }
      }
    }
  }

  #resolveNova(dt) {
    const p = this.player;
    if (p.stats.nova === 0) return;
    p.novaTimer -= dt;
    if (p.novaTimer > 0) return;
    p.novaTimer = p.novaCooldown;

    const radius = p.novaRadius;
    this.fx.ring(p.x, p.y - p.radius, radius, '#ff2a45', 0.5);
    this.fx.blood(p.x, p.y - p.radius, 24, 260);
    this.audio.nova();
    for (const h of this.humans) {
      if (h.dead || dist(p, h) > radius + h.radius) continue;
      if (h.holy) {
        const d = dirTo(p, h);
        h.x += d.x * 60;
        h.y += d.y * 60;
        h.stun = 1.2;
      } else {
        this.#kill(h, 'nova');
      }
    }
  }

  #resolveBolts() {
    const p = this.player;
    for (const b of this.bolts) {
      if (b.dead) continue;
      // Hitbox centrée sur le torse du joueur.
      if (Math.hypot(b.x - p.x, b.y - (p.y - p.radius)) < p.radius + b.radius) {
        b.dead = true;
        this.#hurt(CONFIG.hunter.boltDamage, 'Transpercé par un carreau');
      }
    }
  }

  spawnBolt(x, y, angle) {
    this.bolts.push(new Bolt(x, y, angle));
    this.audio.shoot();
  }

  #kill(h, source) {
    const p = this.player;
    h.dead = true;
    const factor = source === 'bite' ? 1 : CONFIG.bats.bloodFactor;
    const gain = h.cfg.blood * p.stats.bloodGain * factor;
    p.addBlood(gain);

    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimer = CONFIG.bite.comboWindow;
    this.score += h.cfg.score * this.comboMultiplier;
    this.kills += 1;
    this.#gainXp(h.cfg.xp);

    this.fx.blood(h.x, h.y - h.radius);
    this.fx.text(h.x, h.y - h.radius * 3, `+${Math.round(gain)}`, '#ff5470', 15);
    this.audio.bite(this.combo);
    if (source === 'bite') this.fx.shake(2, 0.08);

    // La frénésie se charge par morsures directes hors frénésie : elle ne peut pas s'enchaîner.
    if (!p.inFrenzy && source === 'bite') {
      this.frenzyCharge += 1;
      if (this.frenzyCharge >= CONFIG.frenzy.comboStep) this.#startFrenzy();
    }
  }

  #startFrenzy() {
    const p = this.player;
    p.frenzy = CONFIG.frenzy.duration + p.stats.frenzyBonus;
    this.frenzyCharge = 0;
    this.fx.text(p.x, p.y - 60, 'FRÉNÉSIE !', '#ffd34d', 26);
    this.fx.ring(p.x, p.y - p.radius, 160, '#ffd34d', 0.6);
    this.fx.shake(6, 0.3);
    this.audio.frenzy();
  }

  #hurt(amount, cause) {
    const p = this.player;
    if (p.invuln > 0 || p.inFrenzy) return;
    const dmg = amount * p.stats.armor;
    p.blood -= dmg;
    p.invuln = CONFIG.player.invulnTime;
    p.hurtFlash = 0.2;
    this.combo = 0;
    this.frenzyCharge = 0;
    this.fx.blood(p.x, p.y - p.radius, 20, 220);
    this.fx.text(p.x, p.y - 50, `-${Math.round(dmg)}`, '#ffffff', 20);
    this.fx.shake(10, 0.3);
    this.audio.hurt();
    navigator.vibrate?.(80);
    if (p.blood <= 0) this.#die(cause);
  }

  #die(cause) {
    this.player.blood = 0;
    this.deathCause = cause;
    this.state = State.OVER;
    this.input.enabled = false;
    this.input.reset();
    this.audio.death();
    this.ui.showGameOver(this);
  }

  // ---------------------------------------------------------------- Progression

  #gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level += 1;
      this.pendingLevelUps += 1;
    }
  }

  #openLevelUp() {
    const choices = rollUpgrades(this.upgradeLevels);
    if (choices.length === 0) {
      this.pendingLevelUps = 0;
      return;
    }
    this.state = State.LEVEL_UP;
    this.input.reset();
    this.audio.levelUp();
    this.ui.showLevelUp(choices, this.upgradeLevels, (id) => this.chooseUpgrade(id));
  }

  chooseUpgrade(id) {
    const upgrade = UPGRADES.find((u) => u.id === id);
    upgrade.apply(this.player.stats);
    this.upgradeLevels[id] = (this.upgradeLevels[id] ?? 0) + 1;
    if (id === 'nova') this.player.novaTimer = 1;
    this.pendingLevelUps -= 1;
    this.player.invuln = Math.max(this.player.invuln, 0.6);
    this.state = State.PLAYING;
    this.ui.showHud();
  }

  pause() {
    if (this.state !== State.PLAYING) return;
    this.state = State.PAUSED;
    this.input.reset();
    this.ui.showPause();
  }

  resume() {
    if (this.state !== State.PAUSED) return;
    this.state = State.PLAYING;
    this.ui.showHud();
  }

  // ---------------------------------------------------------------- Monde

  #updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 10);
    this.camera.x += (this.player.x - this.camera.x) * k;
    this.camera.y += (this.player.y - this.camera.y) * k;
  }

  #spawnInitialVillagers() {
    for (let i = 0; i < 7; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(130, 300);
      this.humans.push(new Villager(Math.cos(a) * d, Math.sin(a) * d));
    }
  }

  #spawnPoint() {
    const a = rand(0, Math.PI * 2);
    const d = this.viewRadius + rand(30, 140);
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  }

  #spawn() {
    const t = this.elapsed;
    const count = { villager: 0, hunter: 0, inquisitor: 0 };
    for (const h of this.humans) count[h.kind] += 1;

    const sp = CONFIG.spawn;
    if (count.villager < sp.villagers(t)) {
      const { x, y } = this.#spawnPoint();
      this.humans.push(new Villager(x, y));
    }
    if (count.hunter < sp.hunters(t)) {
      const { x, y } = this.#spawnPoint();
      this.humans.push(new Hunter(x, y));
      if (!this.seen.hunter) {
        this.seen.hunter = true;
        this.ui.flashHint('🏹 Chasseur ! Évite sa ligne rouge', 3.5);
      }
    }
    if (count.inquisitor < sp.inquisitors(t)) {
      const { x, y } = this.#spawnPoint();
      this.humans.push(new Inquisitor(x, y, t));
      if (!this.seen.inquisitor) {
        this.seen.inquisitor = true;
        this.ui.flashHint('✝️ Inquisiteur ! Ne le touche qu\'en frénésie', 3.5);
      }
    }
  }

  #cleanup() {
    const maxDist = this.viewRadius * 1.9;
    for (const h of this.humans) {
      if (dist(h, this.player) > maxDist) h.dead = true;
    }
    this.humans = this.humans.filter((h) => !h.dead);
    this.bolts = this.bolts.filter((b) => !b.dead);
  }
}
