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
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + ratio * 165 + throttle * 14;
    this.o1.frequency.setTargetAtTime(f, t, 0.06);
    this.o2.frequency.setTargetAtTime(f, t, 0.06);
    this.filter.frequency.setTargetAtTime(450 + ratio * 1600 + throttle * 400, t, 0.1);
    this.gain.gain.setTargetAtTime(muted ? 0 : 0.03 + throttle * 0.02 + ratio * 0.01, t, 0.1);
  }
}
