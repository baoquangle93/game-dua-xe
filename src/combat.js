// Hành động: bom mìn, máy bay thả bom, cảnh sát đuổi theo (camera bắn tốc độ),
// hộp quà bí ẩn (nitro, khiên, thả bom, nam châm, sét) và hạ gục đối thủ.
import * as THREE from 'three';
import { sampleAt, heightAtT, ROAD_HALF, WALL_DIST } from './track.js';
import { makeSign, makeWarnRing } from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

export const ITEMS = {
  nitro: { icon: '💨', name: 'NITRO' },
  rockets: { icon: '🚀', name: '+3 TÊN LỬA' },
  shield: { icon: '🛡️', name: 'KHIÊN' },
  bomb: { icon: '💣', name: 'THẢ BOM' },
  magnet: { icon: '🧲', name: 'NAM CHÂM' },
  zap: { icon: '⚡', name: 'SÉT ĐÁNH' },
};

// deps: { scene, track, cfg, jumps, player, ais, police, explosions, sound, hazards, smoke, avoidLane, applyVisuals, rank, maxSpeed }
export function createCombat(deps) {
  const { scene, track, cfg = {}, player, ais, police, explosions, sound, hazards, smoke, avoidLane, applyVisuals, maxSpeed } = deps;
  const { samples, normals, tangents, heights, segLen, N } = track;
  const wrap = (i) => ((Math.floor(i) % N) + N) % N;
  const ahead = (from, to) => ((to - from) % N + N) % N;
  const at = (i, lat, out = new THREE.Vector3()) => { const k = wrap(i), p = samples[k], n = normals[k]; return out.set(p.x + n.x * lat, heights[k], p.z + n.z * lat); };
  const latOf = (r, idx) => { const k = wrap(idx), p = samples[k], n = normals[k]; return (r.pos.x - p.x) * n.x + (r.pos.z - p.z) * n.z; };
  const shadow = (o) => { o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return o; };
  const marks = [];
  let time = 0;
  const queue = []; // sự kiện gửi về cho game: { msg, shake, coins }
  const say = (text, color, extra = {}) => queue.push({ msg: [text, color], ...extra });

  const addSign = (i, icon, text) => {
    const k = wrap(i), t = tangents[k], g = new THREE.Group();
    at(k, 0, g.position); g.rotation.y = Math.atan2(t.x, t.z); scene.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6 }));
    pole.position.set(-(WALL_DIST + 1.6), 1.6, 0);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: makeSign(icon, text), transparent: true, side: THREE.DoubleSide }));
    board.position.set(-(WALL_DIST + 1.6), 3.6, 0); board.rotation.y = Math.PI;
    g.add(pole, board);
  };

  // =================== VỤ NỔ: hất tung mọi xe ở gần ===================
  // source = 'player' khi do người chơi gây ra (thả bom, sét) => được thưởng khi hạ gục đối thủ
  function blast(pos, radius, source) {
    explosions.spawn(pos, radius / 6.5);
    const dp = pos.distanceTo(player.pos);
    sound.boom(1 - dp / 220);
    for (let k = 0; k < 8; k++) smoke.spawn(pos, k % 2 ? '#3a2f2a' : '#6b5a4c', 1.8);
    if (dp < 60) queue.push({ shake: (1 - dp / 60) * 0.9 });
    const all = [player, ...ais, ...(police.active ? [police] : [])];
    for (const r of all) {
      const d = Math.hypot(r.pos.x - pos.x, r.pos.z - pos.z);
      if (d > radius) continue;
      const k = 1 - d / radius;
      if (r === player) {
        if (r.shield > 0) { say('🛡️ KHIÊN ĐỠ ĐƯỢC VỤ NỔ!', '#8ecae6'); continue; }
        const ax = (r.pos.x - pos.x) / (d || 1), az = (r.pos.z - pos.z) / (d || 1);
        r.vel.multiplyScalar(0.55 - 0.3 * k);
        r.vel.x += ax * 10 * k; r.vel.z += az * 10 * k;
        r.vy = 6 + 9 * k; r.air = true;
        r.heading += rand(-0.5, 0.5) * k;
        say('💥 BỊ BOM NỔ TUNG!', '#ff4d6d', { shake: 0.6 * k });
      } else {
        if (r === police && source === 'player') { destroyPolice(); continue; }
        wreck(r, 1.1 + k, 5 + 7 * k);
        if (source === 'player') say('💥 HẠ GỤC ĐỐI THỦ! +10 xu', '#ffd166', { coins: 10 });
      }
    }
  }
  // Xe đối thủ / cảnh sát bị hạ gục: nảy lên, xoay vòng, dừng lại một lúc
  function wreck(r, secs, hop) {
    if (r.wreck > 0.3) return false;
    r.wreck = secs; r.hopV = hop; r.speed *= 0.25;
    return true;
  }

  // =================== BOM MÌN ===================
  const mineGeo = new THREE.SphereGeometry(0.6, 14, 10);
  const mineMat = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.6, roughness: 0.4 });
  const spikeGeo = new THREE.ConeGeometry(0.12, 0.35, 6);
  const blinkMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1010, emissiveIntensity: 2 });
  const mines = [];
  function makeMine() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mineGeo, mineMat));
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(spikeGeo, mineMat);
      const a = (k / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
      s.rotation.set(0, 0, 0); s.lookAt(Math.cos(a) * 2, 0.1, Math.sin(a) * 2); s.rotateX(Math.PI / 2);
      g.add(s);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), blinkMat); lamp.position.y = 0.62; g.add(lamp);
    scene.add(shadow(g));
    return g;
  }
  function addMine(pos, owner, idx) {
    const m = { mesh: makeMine(), pos: pos.clone(), owner, idx, fuse: -1, arm: owner === 'player' ? 0.7 : 0, hidden: 0, home: owner !== 'player' };
    m.mesh.position.copy(pos); m.mesh.position.y += 0.15;
    mines.push(m);
    return m;
  }
  for (const [i, lat] of cfg.mines || []) { addMine(at(i, lat), 'road', i); marks.push({ type: 'mine', pos: at(i, lat) }); }
  if ((cfg.mines || []).length) addSign(cfg.mines[0][0] - 35, '💣', 'CÓ MÌN');

  function updateMines(dt) {
    blinkMat.emissiveIntensity = Math.sin(time * 10) > 0 ? 3 : 0.2;
    const all = [player, ...ais, ...(police.active ? [police] : [])];
    for (let k = mines.length - 1; k >= 0; k--) {
      const m = mines[k];
      if (m.hidden > 0) { m.hidden -= dt; if (m.hidden <= 0) m.mesh.visible = true; continue; }
      if (m.arm > 0) { m.arm -= dt; continue; }
      if (m.fuse < 0) {
        for (const r of all) {
          if (m.owner === 'player' && r === player) continue;
          if (Math.hypot(r.pos.x - m.pos.x, r.pos.z - m.pos.z) < 2.6 && r.pos.y < m.pos.y + 2) { m.fuse = 0.25; break; }
        }
      } else {
        m.fuse -= dt;
        m.mesh.scale.setScalar(1 + (0.25 - m.fuse) * 1.5);
        if (m.fuse <= 0) {
          blast(m.pos, 6.5, m.owner === 'player' ? 'player' : 'road');
          m.fuse = -1; m.mesh.scale.setScalar(1);
          if (m.home) { m.hidden = 12; m.mesh.visible = false; }
          else { scene.remove(m.mesh); mines.splice(k, 1); }
        }
      }
    }
  }

  // =================== MÁY BAY THẢ BOM ===================
  const plane = new THREE.Group();
  {
    const body = new THREE.MeshStandardMaterial({ color: 0x6b7f4a, roughness: 0.6, metalness: 0.2 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a38, metalness: 0.8, roughness: 0.1 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); plane.add(o); return o; };
    add(new THREE.CylinderGeometry(1.1, 0.6, 9, 12).rotateX(Math.PI / 2), body, 0, 0, 0);
    add(new THREE.SphereGeometry(1.1, 12, 10), trim, 0, 0, 4.5);
    add(new THREE.BoxGeometry(14, 0.25, 2.4), body, 0, 0, 0.8);
    add(new THREE.BoxGeometry(5, 0.2, 1.4), body, 0, 0.3, -4);
    add(new THREE.BoxGeometry(0.2, 2, 1.4), trim, 0, 1.2, -4);
    add(new THREE.SphereGeometry(0.8, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.7, 1.8);
    for (const x of [-6.6, 6.6]) add(new THREE.BoxGeometry(0.4, 0.3, 2.5), trim, x, 0, 0.8);
    plane.userData.prop = add(new THREE.BoxGeometry(4, 0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x222222 }), 0, 0, 5.6);
    shadow(plane); plane.visible = false; scene.add(plane);
  }
  const bombGeo = new THREE.CapsuleGeometry(0.4, 0.9, 4, 10);
  const bombMat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.5, roughness: 0.4 });
  const warnMat = new THREE.MeshBasicMaterial({ map: makeWarnRing(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -10 });
  const raid = { on: false, idx: 0, cool: rand(16, 24), targets: [] };
  const planeSpeed = 120 / segLen; // số điểm đường mỗi giây
  function launchRaid() {
    raid.on = true; raid.idx = player.idx - 60;
    raid.targets = [];
    for (let k = 0; k < 5; k++) {
      const i = player.idx + 95 + k * 15, lat = rand(-6, 6), pos = at(i, lat);
      const warn = new THREE.Mesh(new THREE.CircleGeometry(3, 28).rotateX(-Math.PI / 2), warnMat);
      warn.position.set(pos.x, pos.y + 0.12, pos.z); scene.add(warn);
      raid.targets.push({ i, pos, warn, bomb: null, t: 0, start: new THREE.Vector3(), done: false });
    }
    plane.visible = true;
    say('✈️ MÁY BAY NÉM BOM — NÉ VÒNG ĐỎ!', '#ff9f43');
  }
  function updateRaid(dt, racing) {
    if (!raid.on) {
      if (racing) { raid.cool -= dt; if (raid.cool <= 0) launchRaid(); }
      return;
    }
    raid.idx += planeSpeed * dt;
    const i = sampleAt(track, raid.idx, plane.position), t = tangents[i];
    plane.position.y = heightAtT(track, raid.idx) + 42;
    plane.rotation.set(0, Math.atan2(t.x, t.z), Math.sin(time * 1.3) * 0.12);
    plane.userData.prop.rotation.z += dt * 40;
    let pending = 0;
    for (const tg of raid.targets) {
      if (tg.done) continue;
      pending++;
      tg.warn.scale.setScalar(0.7 + 0.3 * Math.abs(Math.sin(time * 7)));
      if (!tg.bomb && raid.idx >= tg.i - 10) {
        tg.bomb = new THREE.Mesh(bombGeo, bombMat); tg.bomb.castShadow = true; scene.add(tg.bomb);
        tg.start.copy(plane.position); tg.t = 0;
      }
      if (tg.bomb) {
        tg.t += dt;
        const k = Math.min(1, tg.t / 1.3);
        tg.bomb.position.lerpVectors(tg.start, tg.pos, k);
        tg.bomb.position.y = tg.start.y + (tg.pos.y - tg.start.y) * k * k + 0.5;
        tg.bomb.rotation.x = k * 1.2;
        if (k >= 1) { blast(tg.pos, 7, 'plane'); scene.remove(tg.bomb); scene.remove(tg.warn); tg.done = true; }
      }
    }
    if (!pending && raid.idx > raid.targets[raid.targets.length - 1].i + 80) {
      raid.on = false; plane.visible = false; raid.cool = rand(28, 40);
    }
  }
  function clearRaid() {
    for (const tg of raid.targets) { if (tg.bomb) scene.remove(tg.bomb); scene.remove(tg.warn); }
    raid.targets = []; raid.on = false; plane.visible = false; raid.cool = rand(16, 24);
  }

  // =================== CAMERA BẮN TỐC ĐỘ + CẢNH SÁT ===================
  const cams = [];
  for (const ci of cfg.cams || []) {
    addSign(ci - 30, '📷', 'CAMERA');
    const k = wrap(ci), t = tangents[k], g = new THREE.Group();
    at(k, 0, g.position); g.rotation.y = Math.atan2(t.x, t.z); scene.add(g);
    const metal = new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.7, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), metal); pole.position.set(WALL_DIST + 1, 3, 0); g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 0.25), metal); arm.position.set(WALL_DIST - 1.5, 6, 0); g.add(arm);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.2), new THREE.MeshStandardMaterial({ color: 0xf1f1f1 })); box.position.set(WALL_DIST - 3.8, 5.6, 0.2); g.add(box);
    const flashMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), flashMat); lens.position.set(WALL_DIST - 3.8, 5.6, -0.42); lens.rotation.y = Math.PI; g.add(lens);
    shadow(g);
    cams.push({ i: ci, flashMat, flash: 0 });
    marks.push({ type: 'cam', pos: at(ci, 0) });
  }
  const LIMIT_KMH = 150;
  let lastIdx = -1;
  function checkCams(dt, kmh) {
    for (const c of cams) {
      c.flash = Math.max(0, c.flash - dt * 3);
      c.flashMat.emissiveIntensity = c.flash * 8;
      if (lastIdx >= 0 && ahead(lastIdx, c.i) < ahead(lastIdx, player.idx) && ahead(lastIdx, player.idx) < 20 && kmh > LIMIT_KMH) {
        c.flash = 1;
        if (!police.active) { startChase(); say('📸 ' + Math.round(kmh) + ' km/h — CẢNH SÁT ĐUỔI THEO!', '#ff4d6d'); }
        else { police.timer = Math.max(police.timer, 25); say('📸 LẠI QUÁ TỐC ĐỘ — CẢNH SÁT CÒN DÍ!', '#ff4d6d'); }
      }
    }
    lastIdx = player.idx;
  }
  // Đèn trên nóc xe cảnh sát
  const barRed = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff1a1a, emissiveIntensity: 0 });
  const barBlue = new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x1a4dff, emissiveIntensity: 0 });
  {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), barRed); r.position.set(0.4, 1.62, -0.4);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), barBlue); b.position.set(-0.4, 1.62, -0.4);
    police.car.chassis.add(r, b);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 3.4), new THREE.MeshStandardMaterial({ color: 0x1d3557 }));
    stripe.position.set(0, 0.68, 0.1); police.car.chassis.add(stripe);
    police.car.group.visible = false;
  }
  const polPoint = new THREE.Vector3();
  function startChase() {
    Object.assign(police, {
      active: true, t: player.idx - 55, lane: latOf(player, player.idx), speed: Math.max(30, Math.abs(player.fs) * 0.9),
      timer: 32, meter: 0, lostT: 0, wreck: 0, hopV: 0, hopY: 0, spinVis: 0, leaving: 0, destroyed: false,
    });
    // Đặt xe ngay trên làn đường, quay đầu theo chiều chạy
    const k = sampleAt(track, police.t, police.pos), t = tangents[k], n = normals[k];
    police.pos.addScaledVector(n, police.lane);
    police.heading = Math.atan2(t.x, t.z);
    police.car.group.visible = true;
  }
  function endChase(text, color, coins = 0) {
    police.leaving = 1.5;
    say(text, color, { coins });
  }
  function updatePolice(dt) {
    barRed.emissiveIntensity = police.active && Math.floor(time * 6) % 2 ? 4 : 0.2;
    barBlue.emissiveIntensity = police.active && Math.floor(time * 6) % 2 === 0 ? 4 : 0.2;
    if (!police.active) { sound.siren(0); return; }
    if (police.leaving > 0) {
      police.leaving -= dt;
      if (police.leaving <= 0) { police.active = false; police.car.group.visible = false; }
    }
    const p = police;
    let d = ahead(p.t, player.idx); if (d > N / 2) d -= N; // > 0: người chơi ở phía trước
    const pSpeed = Math.abs(player.fs);
    const pLane = clamp(latOf(player, player.idx), -ROAD_HALF + 1.5, ROAD_HALF - 1.5);
    let target = p.leaving > 0 ? 20 : d > 6 ? Math.min(maxSpeed * 1.2, pSpeed + 10 + d * 0.5) : d > -3 ? pSpeed + 4 : pSpeed - 6;
    target = Math.min(target, hazards.speedLimit(p.t, p.lane));
    if (p.wreck > 0) { p.wreck -= dt; target = 0; }
    p.speed += clamp(target - p.speed, -40 * dt, 22 * dt);
    p.t += (p.speed * dt) / segLen;
    const want = avoidLane(p.t, hazards.laneAdjust(p.t, d < 30 ? pLane : 0), 35).lane;
    p.lane += (want - p.lane) * Math.min(1, dt * 3);
    // Lấy điểm giữa đường vào biến tạm (KHÔNG ghi đè p.pos), để hướng xe tính đúng theo chiều chạy
    const i = sampleAt(track, p.t, polPoint), n = normals[i];
    let nx = polPoint.x + n.x * p.lane, nz = polPoint.z + n.z * p.lane;
    for (const o of hazards.solids) {
      const ox = nx - o.pos.x, oz = nz - o.pos.z, dd = Math.hypot(ox, oz), min = 2.1 + o.r;
      if (dd < min) { const s = ox * n.x + oz * n.z >= 0 ? 1 : -1; p.lane = clamp(p.lane + s * (min - dd), -ROAD_HALF + 1, ROAD_HALF - 1); nx = polPoint.x + n.x * p.lane; nz = polPoint.z + n.z * p.lane; }
    }
    const dx = nx - p.pos.x, dz = nz - p.pos.z;
    if (dx * dx + dz * dz > 1e-6) {
      // Hướng xe theo chiều di chuyển, nhưng không lệch quá ~25° so với chiều đường (tránh xe quay ngang khi đứng yên đổi làn)
      const tH = Math.atan2(tangents[i].x, tangents[i].z);
      const h = tH + clamp(Math.atan2(Math.sin(Math.atan2(dx, dz) - tH), Math.cos(Math.atan2(dx, dz) - tH)), -0.45, 0.45);
      p.heading += Math.atan2(Math.sin(h - p.heading), Math.cos(h - p.heading)) * Math.min(1, dt * 10);
    }
    if (p.hopV || p.hopY) { p.hopV -= 28 * dt; p.hopY = (p.hopY || 0) + p.hopV * dt; if (p.hopY <= 0) { p.hopY = 0; p.hopV = 0; } }
    p.spinVis = p.wreck > 0 ? (p.spinVis || 0) + dt * 9 : Math.atan2(Math.sin(p.spinVis || 0), Math.cos(p.spinVis || 0)) * (1 - Math.min(1, dt * 5));
    p.pos.set(nx, heightAtT(track, p.t) + p.hopY, nz);
    p.pitch = -Math.atan(track.slopes[i]);
    p.fs = p.speed;
    applyVisuals(p, dt, true, false);
    // Bị bắn hạ: lật nghiêng, bốc khói đen
    p.flip = p.destroyed ? Math.min(Math.PI * 0.9, (p.flip || 0) + dt * 5) : 0;
    p.car.group.rotation.z = p.flip;
    if (p.destroyed && Math.random() < 0.7) smoke.spawn(p.pos.clone().setY(p.pos.y + 1.5), Math.random() < 0.3 ? '#ff7b00' : '#222222', 1.6);

    const dist = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
    sound.siren(Math.max(0, 1 - dist / 180));
    if (p.leaving > 0) return;
    // Bị bắt: cảnh sát áp sát khi xe đang chạy chậm
    if (dist < 8 && pSpeed < 24 && !(player.shield > 0)) p.meter += dt; else p.meter = Math.max(0, p.meter - dt * 0.6);
    if (p.meter > 2.2) {
      player.busted = 2;
      endChase('🚔 BỊ BẮT! Phạt dừng 2 giây, mất 10 xu', '#ff4d6d', -10);
      return;
    }
    // Cắt đuôi: bỏ xa đủ lâu, hoặc cảnh sát hết thời gian đuổi
    p.lostT = dist > 120 ? p.lostT + dt : Math.max(0, p.lostT - dt);
    p.timer -= dt;
    if (p.lostT > 3.5 || p.timer <= 0) endChase('😎 CẮT ĐUÔI CẢNH SÁT! +15 xu', '#06d6a0', 15);
  }

  // =================== HỘP QUÀ BÍ ẨN ===================
  const qTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 128, 128);
    gr.addColorStop(0, '#ff5ec4'); gr.addColorStop(0.5, '#ffd166'); gr.addColorStop(1, '#2ef2ff');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
    g.fillStyle = '#fff'; g.font = '900 86px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 6; g.fillText('?', 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const boxMat = new THREE.MeshStandardMaterial({ map: qTex, emissive: 0xffffff, emissiveMap: qTex, emissiveIntensity: 0.45, transparent: true, opacity: 0.92, roughness: 0.3 });
  const boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const boxes = [];
  for (const bi of cfg.boxes || []) {
    for (const lat of [-5.5, -1.8, 1.8, 5.5]) {
      const pos = at(bi, lat); pos.y += 1.3;
      const mesh = new THREE.Mesh(boxGeo, boxMat); mesh.position.copy(pos); mesh.castShadow = true; scene.add(mesh);
      boxes.push({ pos, mesh, hidden: 0 });
    }
    marks.push({ type: 'box', pos: at(bi, 0) });
  }
  let held = null, roll = 0; // vật phẩm đang giữ, thời gian quay chọn
  function pickItem() {
    const rank = deps.rank();
    const table = [['nitro', 26], ['rockets', police.active ? 40 : 18], ['shield', 18], ['bomb', 20], ['magnet', 14], ['zap', rank >= 4 ? 25 : 6]];
    let s = Math.random() * table.reduce((a, b) => a + b[1], 0);
    for (const [k, w] of table) { if ((s -= w) < 0) return k; }
    return 'nitro';
  }
  function updateBoxes(dt) {
    for (const b of boxes) {
      if (b.hidden > 0) { b.hidden -= dt; if (b.hidden <= 0) b.mesh.visible = true; continue; }
      b.mesh.rotation.set(time * 0.9, time * 1.4, 0);
      b.mesh.position.y = b.pos.y + Math.sin(time * 3 + b.pos.x) * 0.2;
      if (Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z) < 2.3 && Math.abs(player.y + 0.8 - b.pos.y) < 2.5) {
        b.hidden = 5; b.mesh.visible = false;
        for (let k = 0; k < 5; k++) smoke.spawn(b.pos, k % 2 ? '#ff5ec4' : '#2ef2ff', 0.6);
        sound.ding(1.3);
        if (!held && roll <= 0) { roll = 0.9; held = pickItem(); }
      }
    }
    if (roll > 0) roll -= dt;
  }

  // Dùng vật phẩm (phím E / Shift / nút 🎁)
  const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 14), new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  shieldMesh.scale.set(0.8, 0.6, 1.1); shieldMesh.position.y = 0.9; shieldMesh.visible = false;
  player.car.group.add(shieldMesh);
  function useItem() {
    if (!held || roll > 0) return;
    const it = held; held = null;
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    if (it === 'nitro') { player.boost = Math.max(player.boost, 2.8); say('🚀 NITRO!', '#ffd166'); }
    if (it === 'rockets') { ammo += 3; say('🚀 +3 TÊN LỬA — bấm F để bắn', '#ffd166'); }
    if (it === 'shield') { player.shield = 7; say('🛡️ BẬT KHIÊN 7 GIÂY', '#8ecae6'); }
    if (it === 'magnet') { player.magnet = 8; say('🧲 NAM CHÂM HÚT XU', '#ffd166'); }
    if (it === 'bomb') {
      const pos = player.pos.clone(); pos.x -= fx * 4; pos.z -= fz * 4; pos.y = heights[wrap(player.idx)];
      addMine(pos, 'player', player.idx);
      say('💣 ĐÃ THẢ BOM SAU XE', '#ff9f43');
    }
    if (it === 'zap') {
      let n = 0;
      for (const a of [...ais, ...(police.active ? [police] : [])]) {
        if (wreck(a, 1.6, 4)) { n++; explosions.spawn(a.pos, 0.35); }
      }
      queue.push({ flash: 1 });
      say('⚡ SÉT ĐÁNH ' + n + ' XE! +' + n * 3 + ' xu', '#fff3b0', { coins: n * 3 });
    }
    sound.ding(0.8);
  }

  // =================== TÊN LỬA TỰ DẪN (phím F / nút 🎯) ===================
  // Ưu tiên bắn xe cảnh sát đang đuổi (tên lửa tự quay ra phía sau), không có thì nhắm đối thủ phía trước
  let ammo = 2;
  const rockets = [];
  const rocketModel = (() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.3, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf1f1f1, metalness: 0.4, roughness: 0.3 }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.4 }));
    nose.position.z = 0.87;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.z = -1.0;
    g.add(body, nose, flame);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.3), nose.material);
      fin.position.set(Math.cos(k * Math.PI / 2) * 0.18, Math.sin(k * Math.PI / 2) * 0.18, -0.5); fin.rotation.z = k * Math.PI / 2;
      g.add(fin);
    }
    return g;
  })();
  function pickTarget() {
    if (police.active && police.leaving <= 0) return police;
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    let best = null, bestD = 170;
    for (const a of ais) {
      const dx = a.pos.x - player.pos.x, dz = a.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fx + dz * fz) / (d || 1) > 0.35 && !(a.wreck > 0.3)) { best = a; bestD = d; }
    }
    return best;
  }
  function fireRocket() {
    if (ammo <= 0) { say('🚀 HẾT TÊN LỬA — nhặt hộp quà để có thêm', '#b0b0b0'); return; }
    ammo--;
    const target = pickTarget();
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    const back = target === police; // cảnh sát ở phía sau => phóng ra từ đuôi xe
    const mesh = rocketModel.clone(); scene.add(mesh);
    const pos = player.pos.clone().add(new THREE.Vector3(fx * (back ? -2.6 : 2.6), 1.3, fz * (back ? -2.6 : 2.6)));
    const dir = new THREE.Vector3(back ? -fx : fx, 0.15, back ? -fz : fz).normalize();
    const vel = dir.multiplyScalar(Math.max(70, Math.abs(player.fs) + 50));
    rockets.push({ mesh, pos, vel, target, life: 3.5 });
    sound.whoosh();
    say(target === police ? '🚀 BẮN TÊN LỬA VÀO XE CẢNH SÁT!' : target ? '🚀 BẮN TÊN LỬA VÀO ĐỐI THỦ!' : '🚀 BẮN TÊN LỬA!', '#ffd166');
  }
  const want = new THREE.Vector3();
  function updateRockets(dt) {
    for (let k = rockets.length - 1; k >= 0; k--) {
      const r = rockets[k];
      r.life -= dt;
      const tg = r.target && (r.target !== police || police.active) ? r.target : null;
      const speed = Math.min(130, r.vel.length() + 60 * dt);
      if (tg) { // tự dẫn: quay dần về phía mục tiêu
        want.set(tg.pos.x - r.pos.x, tg.pos.y + 0.9 - r.pos.y, tg.pos.z - r.pos.z).normalize();
        r.vel.normalize().lerp(want, Math.min(1, dt * 5)).normalize();
      } else r.vel.normalize();
      r.vel.multiplyScalar(speed);
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      r.mesh.lookAt(r.pos.x + r.vel.x, r.pos.y + r.vel.y, r.pos.z + r.vel.z);
      smoke.spawn(r.pos, Math.random() < 0.5 ? '#d8d8d8' : '#ffb347', 0.45);
      // Trúng xe nào (cảnh sát hoặc đối thủ) thì nổ; hết nhiên liệu cũng nổ
      const victims = [...ais, ...(police.active ? [police] : [])];
      const hit = victims.find((v) => Math.hypot(v.pos.x - r.pos.x, v.pos.z - r.pos.z) < 2.4 && Math.abs(v.pos.y + 0.8 - r.pos.y) < 2.5);
      const ground = heights[wrap(nearIdx(r.pos))];
      if (hit || r.life <= 0 || r.pos.y < ground) {
        blast(r.pos.clone().setY(Math.max(ground, r.pos.y - 0.8)), 5, 'player');
        scene.remove(r.mesh); rockets.splice(k, 1);
      }
    }
  }
  // Chỉ số điểm đường gần một vị trí (tìm quanh vị trí người chơi cho nhanh)
  function nearIdx(pos) {
    let best = player.idx, bd = Infinity;
    for (let o = -80; o <= 80; o += 2) {
      const k = wrap(player.idx + o), s = samples[k], d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  // Xe cảnh sát trúng tên lửa / bom của bạn: lật tung, bốc khói, cuộc truy đuổi kết thúc
  function destroyPolice() {
    if (!police.active || police.destroyed) return;
    police.destroyed = true;
    police.wreck = 3.5; police.hopV = 11; police.speed *= 0.2;
    police.leaving = 3.5;
    say('💥 BẮN HẠ XE CẢNH SÁT! +20 xu', '#ffd166', { coins: 20 });
  }

  // =================== Va chạm / hiệu ứng lên xe người chơi (gọi mỗi bước vật lý) ===================
  function affectPlayer(dt, drive) {
    const r = player;
    r.shield = Math.max(0, (r.shield || 0) - dt);
    r.magnet = Math.max(0, (r.magnet || 0) - dt);
    shieldMesh.visible = r.shield > 0;
    if (r.shield > 0) shieldMesh.material.opacity = 0.16 + Math.sin(time * 8) * 0.06 + (r.shield < 1.5 ? Math.sin(time * 30) * 0.1 : 0);
    if (r.busted > 0) { r.busted -= dt; r.vel.set(0, 0, 0); }
    // Nam châm: hút xu trong bán kính 16
    let got = 0;
    if (r.magnet > 0) {
      for (const c of hazards.coinList) {
        if (c.taken) continue;
        if (Math.hypot(c.pos.x - r.pos.x, c.pos.z - r.pos.z) < 16) { c.taken = true; got++; smoke.spawn(c.pos, '#ffd166', 0.5); }
      }
      if (got && drive) queue.push({ coins: got });
    }
    // Tông xe cảnh sát
    if (police.active) {
      const dx = r.pos.x - police.pos.x, dz = r.pos.z - police.pos.z, d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 1e-3) {
        r.pos.x += (dx / d) * (3.4 - d) * 0.7; r.pos.z += (dz / d) * (3.4 - d) * 0.7;
        r.vel.multiplyScalar(0.94);
        const rel = Math.abs(r.fs) - police.speed;
        if (rel > 22 && wreck(police, 1.4, 6)) say('💥 TÔNG BAY XE CẢNH SÁT! +15 xu', '#ffd166', { coins: 15 });
        else queue.push({ shake: 0.12 });
      }
    }
  }

  // Người chơi tông mạnh vào đối thủ => hạ gục (gọi từ vòng va chạm xe)
  function ram(a) {
    const rel = Math.abs(player.fs) - a.speed;
    if (rel > 20 && wreck(a, 1.3, 5)) say('💥 HẠ GỤC ĐỐI THỦ! +10 xu', '#ffd166', { coins: 10 });
  }

  function warning() {
    if (player.busted > 0) return ['🚔 BỊ CẢNH SÁT GIỮ LẠI...', '#ff4d6d'];
    if (police.active && police.leaving <= 0) {
      if (police.meter > 0.3) return ['🚔 CẢNH SÁT ÁP SÁT — TĂNG TỐC' + (ammo > 0 ? ' HOẶC BẮN TÊN LỬA (F)!' : ' NGAY!'), '#ff4d6d'];
      return ['🚔 CẢNH SÁT ĐANG DÍ — CÒN ' + Math.ceil(police.timer) + 's' + (ammo > 0 ? ' · bấm F bắn tên lửa!' : ''), '#8ecae6'];
    }
    if (raid.on) return ['✈️ MÁY BAY NÉM BOM — NÉ VÒNG ĐỎ!', '#ff9f43'];
    return null;
  }

  return {
    marks, raid, plane, mines, ITEMS,
    get held() { return held; }, get rolling() { return roll > 0; },
    useItem, ram, warning, fireRocket,
    get ammo() { return ammo; },
    // Cho xe đối thủ biết chỗ có mìn để lách
    aiSolids() { return mines.filter((m) => m.hidden <= 0 && m.arm <= 0).map((m) => ({ pos: m.pos, r: 1.4 })); },
    update(dt, state, drive) {
      time += dt;
      const racing = state === 'race';
      updateMines(dt);
      updateRaid(dt, racing && drive);
      if (racing && drive) checkCams(dt, Math.abs(player.fs) * deps.kmh);
      updatePolice(dt);
      updateBoxes(dt);
      updateRockets(dt);
      affectPlayer(dt, drive);
    },
    drain() { const out = queue.splice(0); return out; },
    reset() {
      clearRaid();
      for (let k = mines.length - 1; k >= 0; k--) {
        const m = mines[k];
        if (m.home) { m.hidden = 0; m.fuse = -1; m.mesh.visible = true; m.mesh.scale.setScalar(1); }
        else { scene.remove(m.mesh); mines.splice(k, 1); }
      }
      for (const b of boxes) { b.hidden = 0; b.mesh.visible = true; }
      police.active = false; police.car.group.visible = false; sound.siren(0);
      held = null; roll = 0; lastIdx = -1; ammo = 2;
      for (const r of rockets) scene.remove(r.mesh); rockets.length = 0;
      police.car.group.rotation.z = 0; police.flip = 0; police.destroyed = false;
      Object.assign(player, { shield: 0, magnet: 0, busted: 0 });
      queue.length = 0;
    },
  };
}
