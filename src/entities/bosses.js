import { CONFIG } from '../config.js';
import { dirTo, rand } from '../utils.js';
import { Entity, drawHumanoid, drawShadow } from './entity.js';

/**
 * Base des boss : points de vie, enchaînement d'attaques annoncées (télégraphiées),
 * puis temps de repos pendant lequel le joueur peut mordre.
 * Chaque sous-classe définit `attacks` : { nom: { telegraph, start(game), update(dt, game), end(game) } }.
 */
class Boss extends Entity {
  constructor(x, y, cfg, tier) {
    super(x, y, cfg.radius);
    this.kind = 'boss';
    this.cfg = cfg;
    this.tier = tier;
    this.maxHp = cfg.hp + tier * cfg.hpPerTier;
    this.hp = this.maxHp;
    this.hitCooldown = 0;
    this.batCooldown = 0;
    this.flash = 0;
    this.attack = null; // { name, telegraph, time }
    this.rest = 2;
    this.attackIndex = 0;
  }

  get name() {
    return this.cfg.name;
  }

  /** Vrai quand un contact blesse le joueur au lieu de permettre une morsure. */
  get dangerous() {
    return false;
  }

  damage(amount) {
    this.hp -= amount;
    this.flash = 0.12;
    if (this.hp <= 0) this.dead = true;
  }

  update(dt, game) {
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.batCooldown = Math.max(0, this.batCooldown - dt);
    this.flash = Math.max(0, this.flash - dt);

    if (this.attack) {
      const a = this.attack;
      const def = this.attacks[a.name];
      if (a.telegraph > 0) {
        a.telegraph -= dt;
        if (a.telegraph <= 0) def.start?.call(this, game);
        return;
      }
      a.time -= dt;
      def.update?.call(this, dt, game);
      if (a.time <= 0) {
        def.end?.call(this, game);
        this.attack = null;
        this.rest = this.cfg.rest;
      }
      return;
    }

    this.roam(dt, game);
    this.rest -= dt;
    if (this.rest <= 0 && game.isOnScreen(this, this.radius * 2)) {
      const names = Object.keys(this.attacks);
      const name = names[this.attackIndex++ % names.length];
      const def = this.attacks[name];
      this.attack = { name, telegraph: def.telegraph, time: def.duration ?? 0, max: def.telegraph };
      def.prepare?.call(this, game);
      game.audio.aim();
    }
  }

  // eslint-disable-next-line no-unused-vars
  roam(dt, game) {}

  // eslint-disable-next-line no-unused-vars
  drawTelegraph(ctx, time) {}

  /** Progression du télégraphe en cours (0 → 1). */
  get telegraphProgress() {
    return this.attack ? 1 - this.attack.telegraph / this.attack.max : 0;
  }
}

/** Le Grand Chasseur : salves de carreaux en éventail et charges dévastatrices. */
export class GrandHunter extends Boss {
  constructor(x, y, tier) {
    super(x, y, CONFIG.bosses.grandHunter, tier);
    this.dashing = false;
    this.tired = 0;
    this.aimAngle = 0;
  }

  get dangerous() {
    return this.dashing;
  }

  get volleyCount() {
    return 5 + Math.min(this.tier, 2) * 2;
  }

  attacks = {
    volley: {
      telegraph: 0.9,
      duration: 0.01,
      prepare(game) {
        this.aimAngle = Math.atan2(game.player.y - this.y, game.player.x - this.x);
      },
      start(game) {
        const n = this.volleyCount;
        for (let i = 0; i < n; i++) {
          const a = this.aimAngle + (i - (n - 1) / 2) * 0.22;
          game.spawnBolt(this.x, this.y - this.radius, a);
        }
      },
    },
    charge: {
      telegraph: 0.85,
      duration: 0.6,
      prepare(game) {
        this.aimAngle = Math.atan2(game.player.y - this.y, game.player.x - this.x);
      },
      start(game) {
        this.dashing = true;
        game.fx.shake(4, 0.2);
      },
      update(dt) {
        const s = this.cfg.dashSpeed;
        this.move(Math.cos(this.aimAngle) * s, Math.sin(this.aimAngle) * s, dt);
      },
      end() {
        this.dashing = false;
        this.tired = 1.4; // essoufflé : fenêtre idéale pour mordre
      },
    },
  };

  roam(dt, game) {
    if (this.tired > 0) {
      this.tired -= dt;
      return;
    }
    const to = dirTo(this, game.player);
    const s = this.cfg.speed;
    // S'approche, puis tourne autour du joueur sans jamais fuir : on peut le rattraper.
    if (to.d > 240) this.move(to.x * s, to.y * s, dt);
    else this.move(-to.y * s * 0.5, to.x * s * 0.5, dt);
  }

  drawTelegraph(ctx) {
    if (!this.attack || this.attack.telegraph <= 0) return;
    const k = this.telegraphProgress;
    const sx = this.x;
    const sy = this.y - this.radius;
    if (this.attack.name === 'volley') {
      ctx.strokeStyle = `rgba(255, 40, 60, ${0.25 + k * 0.6})`;
      ctx.lineWidth = 1 + k * 3;
      ctx.setLineDash([10, 8]);
      const n = this.volleyCount;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = this.aimAngle + (i - (n - 1) / 2) * 0.22;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * 700, sy + Math.sin(a) * 700);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const len = this.cfg.dashSpeed * 0.6 + this.radius;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.aimAngle);
      ctx.fillStyle = `rgba(255, 30, 50, ${0.12 + k * 0.25})`;
      ctx.fillRect(0, -this.radius, len, this.radius * 2);
      ctx.fillStyle = 'rgba(255, 60, 80, 0.5)';
      ctx.fillRect(0, -this.radius, len * k, this.radius * 2);
      ctx.restore();
    }
  }

  draw(ctx, time) {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    drawShadow(ctx, r);
    if (this.dashing) {
      ctx.fillStyle = 'rgba(255, 60, 80, 0.3)';
      ctx.beginPath();
      ctx.arc(0, -r, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.scale(this.facing, 1);
    const body = this.flash > 0 ? '#ffffff' : '#3a2616';
    const hy = drawHumanoid(ctx, { r, bob: this.walkT, body, skin: '#e0b48c', hair: null, legs: '#1e140c' });
    // Écharpe rouge
    ctx.fillStyle = '#9e1424';
    ctx.fillRect(-r * 0.6, -r * 0.75, r * 1.2, r * 0.22);
    ctx.fillRect(r * 0.2, -r * 0.6 + Math.sin(time * 8) * 2, r * 0.25, r * 0.6);
    // Barbe
    ctx.fillStyle = '#6b6b6b';
    ctx.beginPath();
    ctx.arc(0, hy + r * 0.35, r * 0.35, 0, Math.PI);
    ctx.fill();
    // Grand chapeau
    ctx.fillStyle = '#1a110a';
    ctx.beginPath();
    ctx.ellipse(0, hy - r * 0.35, r * 1.2, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.55, hy - r * 1.05, r * 1.1, r * 0.7);
    ctx.fillStyle = '#c9a36b';
    ctx.fillRect(-r * 0.55, hy - r * 0.5, r * 1.1, r * 0.1);
    // Arbalète lourde
    ctx.strokeStyle = '#8a8a96';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, -r * 0.3);
    ctx.lineTo(r * 1.5, -r * 0.3);
    ctx.moveTo(r * 1.25, -r * 1.0);
    ctx.quadraticCurveTo(r * 1.75, -r * 0.3, r * 1.25, r * 0.4);
    ctx.stroke();
    ctx.restore();
    if (this.tired > 0) drawDizzy(ctx, this, time);
  }
}

/** Le Grand Inquisiteur : cercles sacrés qui explosent et renforts d'inquisiteurs. */
export class GrandInquisitor extends Boss {
  constructor(x, y, tier) {
    super(x, y, CONFIG.bosses.grandInquisitor, tier);
    this.praying = 0;
  }

  attacks = {
    judgement: {
      telegraph: 0.5,
      duration: 0.6,
      start(game) {
        const p = game.player;
        const n = 3 + Math.min(this.tier, 3);
        game.addHolyZone(p.x, p.y);
        for (let i = 1; i < n; i++) {
          const a = rand(0, Math.PI * 2);
          const d = rand(70, 170);
          game.addHolyZone(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
        }
      },
    },
    judgement2: {
      telegraph: 0.5,
      duration: 0.6,
      start(game) {
        // Anneau de cercles autour du joueur : il faut sortir par un trou.
        const p = game.player;
        const gap = rand(0, Math.PI * 2);
        for (let i = 0; i < 7; i++) {
          const a = gap + 0.6 + i * 0.75;
          game.addHolyZone(p.x + Math.cos(a) * 95, p.y + Math.sin(a) * 95);
        }
        game.addHolyZone(p.x, p.y);
      },
    },
    crusade: {
      telegraph: 0.8,
      duration: 0.3,
      start(game) {
        for (let i = 0; i < 2; i++) game.spawnInquisitorNear(this.x + rand(-60, 60), this.y + rand(-60, 60));
      },
    },
  };

  roam(dt, game) {
    const to = dirTo(this, game.player);
    if (to.d > 140) this.move(to.x * this.cfg.speed, to.y * this.cfg.speed, dt);
  }

  drawTelegraph(ctx, time) {
    if (!this.attack || this.attack.telegraph <= 0) return;
    // Bras levés : halo qui grossit
    const k = this.telegraphProgress;
    ctx.strokeStyle = `rgba(255, 215, 110, ${0.3 + k * 0.6})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.radius * 2.6, 10 + k * 14 + Math.sin(time * 20) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  draw(ctx, time) {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    const pulse = 1 + Math.sin(time * 4) * 0.08;
    const g = ctx.createRadialGradient(0, -r, 6, 0, -r, r * 2.8 * pulse);
    g.addColorStop(0, 'rgba(255, 215, 110, 0.5)');
    g.addColorStop(1, 'rgba(255, 200, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -r, r * 2.8 * pulse, 0, Math.PI * 2);
    ctx.fill();

    drawShadow(ctx, r);
    ctx.scale(this.facing, 1);
    const body = this.flash > 0 ? '#ffffff' : '#f0e6d0';
    const hy = drawHumanoid(ctx, { r, bob: this.walkT, body, skin: '#e8c4a0', hair: null, legs: '#c9bfa8' });
    // Étole pourpre
    ctx.fillStyle = '#7a1a4a';
    ctx.fillRect(-r * 0.45, -r * 0.7, r * 0.22, r * 1.1);
    ctx.fillRect(r * 0.23, -r * 0.7, r * 0.22, r * 1.1);
    // Mitre
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, hy - r * 0.4);
    ctx.lineTo(0, hy - r * 1.6);
    ctx.lineTo(r * 0.5, hy - r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(-r * 0.06, hy - r * 1.25, r * 0.12, r * 0.6);
    ctx.fillRect(-r * 0.22, hy - r * 1.05, r * 0.44, r * 0.12);
    // Crosse
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(r * 1.0, r * 0.8);
    ctx.lineTo(r * 1.0, -r * 2.0);
    ctx.arc(r * 0.75, -r * 2.0, r * 0.25, 0, Math.PI, true);
    ctx.stroke();
    ctx.restore();
  }
}

/** Cercle sacré : annoncé, puis explose et blesse le joueur s'il est dedans. */
export class HolyZone {
  constructor(x, y, radius, delay) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.delay = delay;
    this.max = delay;
    this.dead = false;
    this.exploded = false;
  }

  update(dt) {
    this.delay -= dt;
    if (this.delay <= -0.3) this.dead = true;
  }

  get ready() {
    return this.delay <= 0 && !this.exploded;
  }

  draw(ctx) {
    if (this.delay > 0) {
      const k = 1 - this.delay / this.max;
      ctx.fillStyle = `rgba(255, 210, 90, ${0.08 + k * 0.15})`;
      ctx.strokeStyle = `rgba(255, 215, 110, ${0.5 + k * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 230, 150, 0.35)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * k, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const k = -this.delay / 0.3;
      ctx.fillStyle = `rgba(255, 245, 200, ${0.8 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * (1 + k * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawDizzy(ctx, e, time) {
  ctx.fillStyle = '#ffe14d';
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    const a = time * 6 + (i * Math.PI * 2) / 3;
    ctx.fillText('★', e.x + Math.cos(a) * 18, e.y - e.radius * 3.2 + Math.sin(a) * 5);
  }
}

export const BOSS_TYPES = [GrandHunter, GrandInquisitor];
