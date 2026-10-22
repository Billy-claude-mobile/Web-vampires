import { CONFIG } from './config.js';
import { Player } from './entities/player.js';
import { Bolt, Hunter, Inquisitor, Villager } from './entities/humans.js';
import { BOSS_TYPES, HolyZone } from './entities/bosses.js';
import { GarlicCloud, Herbalist, Hound } from './entities/elite.js';
import { Fx } from './fx.js';
import { meta, soulsForRun } from './meta.js';
import { UPGRADES, rollUpgrades } from './upgrades.js';
import { dirTo, dist, rand } from './utils.js';

const SPAWNERS = {
  villager: (x, y) => new Villager(x, y),
  hunter: (x, y) => new Hunter(x, y),
  inquisitor: (x, y, t) => new Inquisitor(x, y, t),
  hound: (x, y) => new Hound(x, y),
  herbalist: (x, y) => new Herbalist(x, y),
};

const SPAWN_HINTS = {
  hunter: '🏹 Chasseur ! Évite sa ligne rouge',
  inquisitor: '✝️ Inquisiteur ! Ne le touche qu\'en frénésie',
  hound: '🐺 Nouveaux ennemis : les limiers ! Esquive leur bond (zone rouge)',
  herbalist: '🧄 Nouveaux ennemis : les herboristes ! Fuis les nuages d\'ail',
};

/** Part du sang d'une morsure rendue selon la source de la victime. */
const BLOOD_FACTOR = {
  bite: () => 1,
  bat: () => CONFIG.bats.bloodFactor,
  nova: () => CONFIG.nova.bloodFactor,
};

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
    this.zones = [];
    this.hazards = [];
    this.unlocked = {}; // type d'ennemi → instant de son déblocage
    this.threatLevel = 0;
    this.boss = null;
    this.bossesSpawned = 0;
    this.bossesKilled = 0;
    this.nextBossAt = CONFIG.bosses.firstAt;
    this.bossWarned = false;
    this.soulsEarned = 0;
    this.spawnCooldowns = {};
    this.lastDt = 0;
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
    this.seen = {};
    this.deathCause = '';
    this.run = { rerolls: 0, revives: 0, soulGain: 1 };
    this.#spawnInitialVillagers();
  }

  start() {
    this.reset();
    this.#applyMeta();
    this.state = State.PLAYING;
    this.input.enabled = true;
  }

  /** Applique la progression permanente (Crypte) à la nouvelle partie. */
  #applyMeta() {
    const p = this.player;
    const run = meta.applyTo({
      stats: p.stats,
      startBlood: CONFIG.player.startBlood,
      rerolls: 0,
      revives: 0,
      soulGain: 1,
      startUpgrades: [],
    });
    p.blood = Math.min(run.startBlood, p.maxBlood);
    for (const id of run.startUpgrades) this.#applyUpgrade(id);
    this.run = run;
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

  /** Bonus des humains hostiles selon le niveau de Menace. */
  get threat() {
    const per = CONFIG.progression.threatPerLevel;
    const l = this.threatLevel;
    return { speed: 1 + per.speed * l, damage: 1 + per.damage * l, fireRate: 1 + per.fireRate * l, spawn: 1 + per.spawn * l };
  }

  /** Âmes accumulées jusqu'ici dans la partie (créditées à la fin). */
  get souls() {
    return soulsForRun(this, this.run.soulGain);
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
    this.lastDt = dt;

    p.update(dt, this);
    this.#updateCamera(dt);

    if (!p.inFrenzy) {
      p.blood -= this.drainRate * dt;
      if (p.blood <= 0) return this.#die('Ta soif t\'a consumé…');
    }

    this.#spawn();
    for (const h of this.humans) h.update(dt, this);
    for (const b of this.bolts) b.update(dt);
    for (const z of this.zones) z.update(dt);
    for (const h of this.hazards) h.update(dt);

    this.#updateBoss(dt);
    this.#resolveZones();
    this.#resolveHazards(dt);
    if (this.state === State.OVER) return;
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
      if (h.dead) continue;
      const d = dist(p, h);
      if (h.dangerous && !p.inFrenzy) {
        // Limier en plein bond : c'est lui qui mord.
        if (d <= p.radius + h.radius) {
          this.#hurt(h.cfg.damage, 'Mis en pièces par un limier');
          h.endLunge();
        }
      } else if (h.canBeBitten(p)) {
        if (d <= p.biteRadius + h.radius) this.#kill(h, 'bite');
      } else if (d <= p.radius + h.radius) {
        // Contact avec un inquisiteur : dégâts + repousse. Seul le corps compte, pas la portée des crocs.
        this.#hurt(h.cfg.contactDamage, 'Purifié par un inquisiteur');
        this.#repel(h, 40, 0.8);
      }
    }
  }

  #resolveBats() {
    const p = this.player;
    if (p.stats.bats === 0) return;
    const reach = CONFIG.bats.radius;
    for (const bat of p.batPositions) {
      for (const h of this.humans) {
        if (h.dead || dist(bat, h) >= reach + h.radius) continue;
        if (h.canBeBitten(p)) {
          this.#kill(h, 'bat');
        } else if (!(h.stun > 0)) {
          // Les chauves-souris ne peuvent pas mordre un inquisiteur, mais elles le repoussent.
          this.#repel(h, CONFIG.bats.repel, CONFIG.bats.stun);
          this.fx.sparks(h.x, h.y - h.radius, '#ffd34d', 6);
        }
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
    if (this.boss && dist(p, this.boss) < radius + this.boss.radius) this.#damageBoss(CONFIG.bosses.novaDamage);
    for (const h of this.humans) {
      if (h.dead || dist(p, h) > radius + h.radius) continue;
      if (h.holy) {
        this.#repel(h, 60, 1.2);
      } else {
        this.#kill(h, 'nova');
      }
    }
  }

  throwGarlic(fromX, fromY, x, y) {
    this.hazards.push(new GarlicCloud(fromX, fromY, x, y));
  }

  /** Nuages d'ail : ralentissent et brûlent le joueur tant qu'il est dedans (sauf en frénésie). */
  #resolveHazards(dt) {
    const p = this.player;
    const inside = !p.inFrenzy && this.hazards.some((h) => h.contains(p));
    const cloud = CONFIG.herbalist.cloud;
    p.slowMult = inside ? cloud.slow : 1;
    if (!inside) return;
    p.blood -= cloud.dps * this.threat.damage * p.stats.armor * dt;
    if (p.blood <= 0) this.#die('Asphyxié par l\'ail');
  }

  /** Repousse un humain loin du joueur et l'étourdit. */
  #repel(h, distance, stun) {
    const d = dirTo(this.player, h);
    h.x += d.x * distance;
    h.y += d.y * distance;
    h.stun = stun;
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

  // ---------------------------------------------------------------- Boss

  #updateBoss(dt) {
    const cfg = CONFIG.bosses;
    if (!this.boss) {
      if (!this.bossWarned && this.elapsed >= this.nextBossAt - cfg.warning) {
        this.bossWarned = true;
        this.ui.flashHint('⚠️ Un boss approche !', cfg.warning);
        this.audio.bossWarning();
      }
      if (this.elapsed >= this.nextBossAt) this.#spawnBoss();
      return;
    }

    const b = this.boss;
    const p = this.player;
    b.update(dt, this);

    // Un boss trop loin revient vers le joueur.
    if (dist(b, p) > this.viewRadius * 1.6) Object.assign(b, this.#spawnPoint());

    // Contact : morsure (et recul) sauf pendant une charge.
    const d = dirTo(p, b);
    if (d.d < p.radius + b.radius + p.stats.biteRange * 0.5) {
      if (b.dangerous) {
        this.#hurt(cfg.grandHunter.dashDamage, `Écrasé par ${b.name.toLowerCase()}`);
      } else if (b.hitCooldown <= 0) {
        b.hitCooldown = cfg.hitCooldown;
        p.addBlood(cfg.biteBlood * p.stats.bloodGain);
        this.#damageBoss(p.inFrenzy ? cfg.frenzyBiteDamage : cfg.biteDamage);
      }
      p.knockback(-d.x, -d.y, cfg.knockback);
    }

    // Les chauves-souris grignotent le boss.
    if (b.batCooldown <= 0) {
      for (const bat of p.batPositions) {
        if (dist(bat, b) < CONFIG.bats.radius + b.radius) {
          b.batCooldown = 0.3;
          this.#damageBoss(cfg.batDamage);
          break;
        }
      }
    }
  }

  #spawnBoss() {
    const Type = BOSS_TYPES[this.bossesSpawned % BOSS_TYPES.length];
    const { x, y } = this.#spawnPoint();
    this.boss = new Type(x, y, this.bossesSpawned);
    this.bossesSpawned += 1;
    this.ui.flashHint(`☠️ ${this.boss.name} ! Mords-le entre ses attaques`, 3.5);
  }

  #damageBoss(amount) {
    const b = this.boss;
    if (!b || b.dead) return;
    b.damage(amount);
    this.score += 10;
    this.fx.blood(b.x, b.y - b.radius, 10, 180);
    this.audio.bite(4);
    this.fx.shake(3, 0.1);
    if (b.dead) this.#killBoss();
  }

  #killBoss() {
    const b = this.boss;
    const p = this.player;
    const reward = CONFIG.bosses.reward;
    this.boss = null;
    this.bossesKilled += 1;
    this.bossWarned = false;
    this.nextBossAt = this.elapsed + CONFIG.bosses.interval;
    this.zones.length = 0;
    p.addBlood(reward.blood);
    this.score += reward.score * (b.tier + 1);
    this.pendingLevelUps += 1;
    this.fx.blood(b.x, b.y - b.radius, 60, 400);
    this.fx.ring(b.x, b.y - b.radius, 220, '#ffd34d', 0.8);
    this.fx.text(b.x, b.y - 70, 'BOSS VAINCU !', '#ffd34d', 28);
    this.fx.shake(12, 0.5);
    this.audio.bossDown();
    this.#advanceProgression();
  }

  /** Après un boss : nouvel ennemi pour les premiers, sinon un niveau de Menace en plus. */
  #advanceProgression() {
    const unlock = CONFIG.progression.unlocks[this.bossesKilled - 1];
    if (unlock) {
      this.unlocked[unlock] = this.elapsed;
      this.seen[unlock] = true;
      this.ui.flashHint(SPAWN_HINTS[unlock], 4.5);
    } else {
      this.threatLevel += 1;
      this.ui.flashHint(`⚠️ Menace ${this.threatLevel} : les humains se renforcent !`, 4);
    }
  }

  addHolyZone(x, y) {
    const z = CONFIG.bosses.holyZone;
    this.zones.push(new HolyZone(x, y, z.radius, z.delay));
  }

  spawnInquisitorNear(x, y) {
    this.humans.push(new Inquisitor(x, y, this.elapsed));
  }

  #resolveZones() {
    const p = this.player;
    for (const z of this.zones) {
      if (!z.ready) continue;
      z.exploded = true;
      this.fx.sparks(z.x, z.y, '#ffe9a0', 12);
      if (Math.hypot(p.x - z.x, p.y - z.y) < z.radius + p.radius * 0.4) {
        this.#hurt(CONFIG.bosses.holyZone.damage, 'Foudroyé par un jugement sacré');
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
    const factor = BLOOD_FACTOR[source]();
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

    // Toute victime charge la frénésie, mais seulement hors frénésie : elle ne peut pas s'enchaîner.
    if (!p.inFrenzy) {
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
    const dmg = amount * p.stats.armor * this.threat.damage;
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
    if (this.run.revives > 0) return this.#revive();
    this.player.blood = 0;
    this.deathCause = cause;
    this.state = State.OVER;
    this.input.enabled = false;
    this.input.reset();
    this.audio.death();
    this.soulsEarned = this.souls;
    meta.addSouls(this.soulsEarned);
    this.ui.showGameOver(this);
  }

  #revive() {
    const p = this.player;
    this.run.revives -= 1;
    p.blood = p.maxBlood * 0.5;
    p.invuln = 2.5;
    this.bolts.length = 0;
    this.zones.length = 0;
    this.hazards.length = 0;
    for (const h of this.humans) {
      if (h.kind !== 'villager' && dist(h, p) < 220) h.dead = true;
    }
    this.fx.ring(p.x, p.y - p.radius, 240, '#b67be8', 0.8);
    this.fx.text(p.x, p.y - 70, 'RÉSURRECTION !', '#d9b0ff', 26);
    this.ui.flashHint('⚰️ Ton cercueil t\'a ramené à la vie', 2.5);
    this.audio.revive();
  }

  // ---------------------------------------------------------------- Progression

  #gainXp(amount) {
    this.xp += amount * this.player.stats.xpGain;
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
    this.#showChoices(choices);
  }

  #showChoices(choices) {
    this.ui.showLevelUp(choices, this.upgradeLevels, {
      onPick: (id) => this.chooseUpgrade(id),
      rerolls: this.run.rerolls,
      onReroll: () => this.rerollUpgrades(),
    });
  }

  rerollUpgrades() {
    if (this.state !== State.LEVEL_UP || this.run.rerolls <= 0) return;
    this.run.rerolls -= 1;
    this.#showChoices(rollUpgrades(this.upgradeLevels));
  }

  #applyUpgrade(id) {
    UPGRADES.find((u) => u.id === id).apply(this.player.stats);
    this.upgradeLevels[id] = (this.upgradeLevels[id] ?? 0) + 1;
    if (id === 'nova') this.player.novaTimer = 1;
  }

  chooseUpgrade(id) {
    if (this.state !== State.LEVEL_UP) return;
    this.#applyUpgrade(id);
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
    const count = {};
    for (const h of this.humans) count[h.kind] = (count[h.kind] ?? 0) + 1;
    // Pendant un combat de boss, moins de renforts hostiles.
    const pressure = this.boss ? 0.34 : 1;

    for (const [kind, rule] of Object.entries(CONFIG.spawn)) {
      if (rule.unlock && !(kind in this.unlocked)) continue;
      this.spawnCooldowns[kind] = (this.spawnCooldowns[kind] ?? 0) - this.lastDt;
      const t = rule.unlock ? this.elapsed - this.unlocked[kind] : this.elapsed;
      const hostile = kind !== 'villager';
      const target = rule.target(t) * (hostile ? pressure * this.threat.spawn : 1);
      if ((count[kind] ?? 0) >= Math.floor(target) || this.spawnCooldowns[kind] > 0) continue;
      this.spawnCooldowns[kind] = rule.interval;
      const { x, y } = this.#spawnPoint();
      this.humans.push(SPAWNERS[kind](x, y, this.elapsed));
      if (!this.seen[kind] && SPAWN_HINTS[kind]) {
        this.seen[kind] = true;
        this.ui.flashHint(SPAWN_HINTS[kind], 3.5);
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
    this.zones = this.zones.filter((z) => !z.dead);
    this.hazards = this.hazards.filter((h) => !h.dead);
  }
}
