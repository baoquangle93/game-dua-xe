// Khói bánh xe và tiếng động cơ (tự tổng hợp bằng Web Audio, không cần file âm thanh)
import * as THREE from 'three';
import { makeSmoke } from './textures.js';

export class Smoke {
  constructor(scene, count = 110) {
    const tex = makeSmoke();
    this.pool = [];
    this.next = 0;
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, life: 0, max: 1, size: 1, vel: new THREE.Vector3() });
    }
  }
  spawn(pos, color, size = 1.1) {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    p.s.position.copy(pos);
    p.s.material.color.set(color);
    p.life = 0; p.max = 0.8 + Math.random() * 0.7; p.size = size;
    p.vel.set((Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
    p.s.visible = true;
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { p.s.visible = false; continue; }
      p.s.position.addScaledVector(p.vel, dt);
      const sc = p.size * (1 + k * 3.2);
      p.s.scale.set(sc, sc, 1);
      p.s.material.opacity = 0.5 * (1 - k);
    }
  }
  clear() { for (const p of this.pool) p.s.visible = false; }
}

export class EngineSound {
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.detune.value = -1200;
      const g2 = ctx.createGain(); g2.gain.value = 0.45;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600;
      const gain = ctx.createGain(); gain.gain.value = 0;
      o1.connect(filter); o2.connect(g2).connect(filter);
      filter.connect(gain).connect(ctx.destination);
      o1.start(); o2.start();
      Object.assign(this, { ctx, o1, o2, filter, gain });
    } catch (e) { this.ctx = null; }
  }
  update(ratio, throttle, muted) {
    this.muted = muted;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + ratio * 165 + throttle * 14;
    this.o1.frequency.setTargetAtTime(f, t, 0.06);
    this.o2.frequency.setTargetAtTime(f, t, 0.06);
    this.filter.frequency.setTargetAtTime(450 + ratio * 1600 + throttle * 400, t, 0.1);
    this.gain.gain.setTargetAtTime(muted ? 0 : 0.03 + throttle * 0.02 + ratio * 0.01, t, 0.1);
  }
}

// Vụ nổ: quả cầu lửa lớn dần rồi tắt, vòng sóng xung kích trên mặt đất, chớp sáng
export class Explosions {
  constructor(scene, count = 8) {
    this.pool = [];
    const ball = new THREE.IcosahedronGeometry(1, 2);
    const ring = new THREE.TorusGeometry(1, 0.12, 6, 32).rotateX(Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group(); g.visible = false;
      const mk = (geo, color) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const fire = mk(ball, 0xff6a00), core = mk(ball, 0xfff2a0), wave = mk(ring, 0xffc070);
      g.add(fire, core, wave);
      scene.add(g);
      this.pool.push({ g, fire, core, wave, t: 0, size: 1, on: false });
    }
    this.next = 0;
    this.light = new THREE.PointLight(0xffa040, 0, 60, 1.6);
    scene.add(this.light);
  }
  spawn(pos, size = 1) {
    const e = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
    e.g.position.copy(pos); e.g.position.y += 0.8;
    e.t = 0; e.size = size; e.on = true; e.g.visible = true;
    this.light.position.copy(e.g.position); this.light.position.y += 2;
    this.light.intensity = 220 * size;
  }
  update(dt) {
    this.light.intensity = Math.max(0, this.light.intensity - dt * 900);
    for (const e of this.pool) {
      if (!e.on) continue;
      e.t += dt;
      const k = e.t / 0.7;
      if (k >= 1) { e.on = false; e.g.visible = false; continue; }
      const s = e.size;
      e.fire.scale.setScalar(s * (1.5 + 5.5 * Math.sqrt(k)));
      e.fire.material.opacity = 0.9 * (1 - k);
      e.core.scale.setScalar(s * (1 + 3 * Math.sqrt(k)) * (1 - k * 0.6));
      e.core.material.opacity = 1 - k;
      e.wave.scale.setScalar(s * (1 + 14 * k));
      e.wave.position.y = -0.6;
      e.wave.material.opacity = 0.8 * (1 - k);
    }
  }
  clear() { for (const e of this.pool) { e.on = false; e.g.visible = false; } this.light.intensity = 0; }
}

// Thêm âm thanh: tiếng nổ, còi cảnh sát, tiếng "ting" khi nhặt đồ
EngineSound.prototype.boom = function (volume = 1) {
  if (!this.ctx || this.muted || volume <= 0.02) return;
  const ctx = this.ctx, t = ctx.currentTime, len = ctx.sampleRate * 1.2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(120, t + 1);
  const g = ctx.createGain(); g.gain.value = 0.5 * Math.min(1, volume);
  src.connect(f).connect(g).connect(ctx.destination); src.start();
};
EngineSound.prototype.siren = function (level) {
  if (!this.ctx) return;
  if (!this.sirenOsc) {
    const o = this.ctx.createOscillator(); o.type = 'triangle';
    const g = this.ctx.createGain(); g.gain.value = 0;
    o.connect(g).connect(this.ctx.destination); o.start();
    this.sirenOsc = o; this.sirenGain = g;
  }
  const t = this.ctx.currentTime;
  this.sirenOsc.frequency.setTargetAtTime(Math.floor(t * 2) % 2 ? 960 : 660, t, 0.02);
  this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.06 * level, t, 0.08);
};
EngineSound.prototype.ding = function (pitch = 1) {
  if (!this.ctx || this.muted) return;
  const ctx = this.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(1100 * pitch, t); o.frequency.exponentialRampToValueAtTime(1800 * pitch, t + 0.08);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g).connect(ctx.destination); o.start(); o.stop(t + 0.2);
};

// Tiếng tên lửa phóng: tiếng xì rít ngắn
EngineSound.prototype.whoosh = function () {
  if (!this.ctx || this.muted) return;
  const ctx = this.ctx, t = ctx.currentTime, len = ctx.sampleRate * 0.6;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
  const g = ctx.createGain(); g.gain.value = 0.25;
  src.connect(f).connect(g).connect(ctx.destination); src.start();
};
