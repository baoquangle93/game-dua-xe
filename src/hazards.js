// Chướng ngại vật "sống" trên đường đua:
// đàn trâu qua đường, xe tải chạy chậm làm rơi thùng hàng, đá lở, chắn tàu hoả,
// mưa rào (đường trơn), ổ gà (xe nảy lên), xu vàng để nhặt và vòng lửa trên dốc nhảy.
import * as THREE from 'three';
import { ribbon, sampleAt, heightAtT, ROAD_HALF, WALL_DIST } from './track.js';
import { makeSign, makePothole, makeWarnRing } from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

// cfg: danh sách vị trí của từng loại (xem stages.js), jumps: dốc nhảy của chặng
export function createHazards(scene, track, cfg = {}, jumps = []) {
  const { samples, normals, tangents, heights, segLen, N } = track;
  const perUnit = 1 / segLen;
  const wrap = (i) => ((Math.floor(i) % N) + N) % N;
  const ahead = (from, to) => ((to - from) % N + N) % N; // số điểm từ `from` đi tới `to` (theo chiều chạy)
  const at = (i, lat, out = new THREE.Vector3()) => {
    const k = wrap(i), p = samples[k], n = normals[k];
    return out.set(p.x + n.x * lat, heights[k], p.z + n.z * lat);
  };
  const frameAt = (i, side = 1) => { // trục x = ngang đường, trục z = hướng chạy
    const g = new THREE.Group(), k = wrap(i), t = tangents[k];
    at(k, 0, g.position);
    g.rotation.y = Math.atan2(t.x, t.z) + (side < 0 ? Math.PI : 0);
    scene.add(g);
    return g;
  };
  const shadow = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  const solids = [];   // vật cản cứng đang có mặt (cập nhật mỗi khung hình)
  const marks = [];    // chấm đánh dấu trên bản đồ nhỏ
  const updaters = [], resetters = [];
  let time = 0;

  // Biển báo bên phải đường, đặt trước chỗ nguy hiểm, quay mặt về phía xe đang tới
  const signMats = {};
  const addSign = (i, icon, text) => {
    const key = icon + text;
    signMats[key] ??= new THREE.MeshBasicMaterial({ map: makeSign(icon, text), transparent: true, side: THREE.DoubleSide });
    const f = frameAt(i);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6 }));
    pole.position.set(WALL_DIST + 1.6, 1.6, 0);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), signMats[key]);
    board.position.set(WALL_DIST + 1.6, 3.6, 0); board.rotation.y = Math.PI;
    f.add(shadow(pole), board);
  };

  // =================== ĐÀN TRÂU QUA ĐƯỜNG ===================
  const buffaloMats = {
    hide: new THREE.MeshStandardMaterial({ color: 0x45403b, roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24201d, roughness: 0.9 }),
    horn: new THREE.MeshStandardMaterial({ color: 0xd8ccb8, roughness: 0.6 }),
  };
  function buffaloModel() {
    const g = new THREE.Group(), M = buffaloMats;
    const box = (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
    box(1.25, 1.0, 2.3, M.hide, 0, 1.38, 0);
    box(1.1, 0.5, 1.9, M.dark, 0, 1.0, 0);
    const head = new THREE.Group(); head.position.set(0, 1.55, 1.25); g.add(head);
    box(0.62, 0.62, 0.85, M.hide, 0, 0, 0.35, head);
    box(0.5, 0.36, 0.3, M.dark, 0, -0.16, 0.85, head);
    const horn = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 6, 16, Math.PI), M.horn);
    horn.position.set(0, 0.3, 0.2); horn.rotation.x = -0.5; horn.scale.y = 0.65; head.add(horn);
    const legs = [];
    for (const [x, z] of [[0.42, 0.8], [-0.42, 0.8], [0.42, -0.8], [-0.42, -0.8]]) {
      const p = new THREE.Group(); p.position.set(x, 1.0, z); g.add(p);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.0, 0.24).translate(0, -0.5, 0), M.dark); p.add(leg);
      legs.push(p);
    }
    box(0.08, 0.7, 0.08, M.dark, 0, 1.1, -1.2);
    return { group: shadow(g), legs, head };
  }
  for (const bi of cfg.buffalo || []) {
    addSign(bi - 40, '🐃', 'TRÂU');
    const herd = [-2.6, 0, 2.9].map((off) => ({ ...buffaloModel(), off, jit: rand(-0.8, 0.8), phase: rand(0, 6) }));
    herd.forEach((b) => scene.add(b.group));
    const h = { i: bi, herd, side: -1, lat: -12.5, state: 'idle', timer: rand(1, 4) };
    marks.push({ type: 'buffalo', pos: at(bi, 0) });
    const reset = () => { h.side = Math.random() < 0.5 ? -1 : 1; h.lat = h.side * 12.5; h.state = 'idle'; h.timer = rand(1, 4); };
    resetters.push(reset); reset();
    updaters.push((dt) => {
      h.timer -= dt;
      if (h.state === 'idle' && h.timer <= 0) h.state = 'walk';
      if (h.state === 'walk') {
        h.lat -= h.side * 2.6 * dt;
        if (Math.abs(h.lat) >= 12.5 && Math.sign(h.lat) === -h.side) { h.side = -h.side; h.lat = h.side * 12.5; h.state = 'idle'; h.timer = rand(4, 8); }
      }
      const walking = h.state === 'walk', n = normals[wrap(bi)], t = tangents[wrap(bi)];
      for (const b of herd) {
        at(bi + b.off * perUnit, h.lat + b.jit + (walking ? 0 : b.off * 0.3), b.group.position);
        const dir = -h.side; // hướng đi ngang qua đường
        b.group.rotation.y = walking ? Math.atan2(n.x * dir, n.z * dir) : Math.atan2(t.x, t.z) + b.phase;
        const swing = walking ? Math.sin(time * 6 + b.phase) * 0.45 : 0;
        b.legs.forEach((l, k) => { l.rotation.x = k % 3 === 0 ? swing : -swing; });
        b.head.rotation.x = walking ? 0 : 0.5 + Math.sin(time * 1.5 + b.phase) * 0.1; // cúi đầu gặm cỏ
        solids.push({ pos: b.group.position, r: 1.35, kind: 'buffalo', top: 1.9 });
      }
    });
    h.blocks = (t, lane) => h.state === 'walk' && Math.abs(lane - h.lat) < 4.5;
    (cfg._blockers ??= []).push(h);
  }

  // =================== CHẮN TÀU HOẢ ===================
  const trains = [];
  for (const ci of cfg.train || []) {
    addSign(ci - 45, '🚂', 'CHẮN TÀU');
    const f = frameAt(ci);
    const metal = new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.8, roughness: 0.35 });
    // Đường ray ngang qua mặt đường, kéo dài ra hai bên
    for (const z of [-0.75, 0.75]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(220, 0.12, 0.12), metal); rail.position.set(0, 0.1, z); f.add(rail); }
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.08, 2.6), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }), 120);
    const dm = new THREE.Object3D();
    for (let k = 0; k < 120; k++) { dm.position.set(-110 + k * 1.85, 0.06, 0); dm.updateMatrix(); sleepers.setMatrixAt(k, dm.matrix); }
    f.add(sleepers);
    // Đoàn tàu: đầu máy + 4 toa
    const train = new THREE.Group(); f.add(train);
    const bodyMats = [0x1d4e89, 0xd9d4c7, 0xd9d4c7, 0xd9d4c7, 0xd9d4c7].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2 }));
    const stripe = new THREE.MeshStandardMaterial({ color: 0xc1121f, roughness: 0.5 });
    const win = new THREE.MeshStandardMaterial({ color: 0x1b2430, emissive: 0xffd27a, emissiveIntensity: 0.6 });
    const CAR = 12, GAP = 0.8, LEN = 5 * CAR + 4 * GAP;
    for (let k = 0; k < 5; k++) {
      const x = -k * (CAR + GAP) - CAR / 2;
      const car = new THREE.Mesh(new THREE.BoxGeometry(CAR, 3.4, 3.1), bodyMats[k]); car.position.set(x, 2.3, 0); train.add(car);
      const st = new THREE.Mesh(new THREE.BoxGeometry(CAR + 0.02, 0.35, 3.14), stripe); st.position.set(x, 1.4, 0); train.add(st);
      if (k > 0) { const w = new THREE.Mesh(new THREE.BoxGeometry(CAR - 1.5, 0.8, 3.16), win); w.position.set(x, 2.8, 0); train.add(w); }
      for (const wx of [-CAR / 2 + 2, CAR / 2 - 2]) { const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 2.4), metal); bogie.position.set(x + wx, 0.5, 0); train.add(bogie); }
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 3.0), bodyMats[0]); nose.position.set(0.7, 1.9, 0); train.add(nose);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff3c0 })); lamp.position.set(1.45, 2.5, 0); train.add(lamp);
    shadow(train);
    // Cần chắn sọc đỏ trắng + đèn đỏ nhấp nháy ở hai bên đường (phía xe tới)
    const boomTex = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const boomRed = new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.5 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0 });
    const booms = [];
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), metal); post.position.set(s * (ROAD_HALF + 2), 0.7, -7); f.add(post);
      const pivot = new THREE.Group(); pivot.position.set(s * (ROAD_HALF + 2), 1.3, -7); f.add(pivot);
      for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.18), k % 2 ? boomRed : boomTex); seg.position.set(-s * (0.75 + k * 1.5), 0, 0); pivot.add(seg); }
      const lp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), metal); lp.position.set(s * (ROAD_HALF + 3.2), 1.7, -7.5); f.add(lp);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lightMat); bulb.position.set(s * (ROAD_HALF + 3.2), 3.3, -7.2); f.add(bulb);
      booms.push({ pivot, s });
    }
    shadow(f);
    const c = { i: ci, f, train, booms, lightMat, LEN, speed: 34, idle: 9, clock: 0, dir: 1, down: false, front: -999 };
    const travel = () => (2 * 95 + LEN) / c.speed;
    c.period = () => c.idle + travel();
    const reset = () => { c.clock = rand(0, c.idle); c.dir = Math.random() < 0.5 ? 1 : -1; };
    resetters.push(reset); reset();
    updaters.push((dt) => {
      c.clock += dt;
      if (c.clock > c.period()) { c.clock = 0; c.dir = -c.dir; }
      const tc = c.clock - c.idle; // > 0: tàu đang chạy
      c.front = tc > 0 ? -95 + tc * c.speed : -999;
      const tail = c.front - LEN;
      c.occupied = tc > 0 && c.front > -WALL_DIST && tail < WALL_DIST;
      c.down = tc > -2.6 && tail < WALL_DIST + 4; // hạ chắn 2.6 giây trước khi tàu tới
      train.visible = tc > 0;
      train.position.x = c.dir * c.front; train.rotation.y = c.dir > 0 ? 0 : Math.PI;
      for (const b of booms) b.pivot.rotation.z += ((c.down ? 0 : b.s * 1.45) - b.pivot.rotation.z) * Math.min(1, dt * 3);
      lightMat.emissiveIntensity = c.down && Math.sin(time * 9) > 0 ? 3 : 0;
    });
    trains.push(c);
    marks.push({ type: 'train', pos: at(ci, 0) });
    (cfg._blockers ??= []).push({ i: ci, blocks: () => c.down });
  }

  // =================== XE TẢI CHẠY CHẬM (thỉnh thoảng rơi thùng hàng) ===================
  const trucks = [], crates = [];
  const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.9 });
  const crateEdge = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
  function truckModel(color) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    const box = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x14202c, metalness: 0.8, roughness: 0.1 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff2222, emissiveIntensity: 1.5 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    add(new THREE.BoxGeometry(2.5, 2.3, 2.1), paint, 0, 1.75, 3.0);
    add(new THREE.BoxGeometry(2.3, 0.9, 0.1), glass, 0, 2.3, 4.06);
    add(new THREE.BoxGeometry(2.6, 3.0, 6.4), box, 0, 2.2, -1.4);
    add(new THREE.BoxGeometry(2.62, 0.4, 6.42), paint, 0, 1.5, -1.4);
    add(new THREE.BoxGeometry(2.4, 0.4, 8.8), dark, 0, 0.75, 0);
    for (const x of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.5, 0.25, 0.08), tail, x, 1.0, -4.62);
    const wheels = [];
    for (const z of [3.0, -0.8, -3.2]) for (const x of [-1.15, 1.15]) {
      wheels.push(add(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14).rotateZ(Math.PI / 2), dark, x, 0.55, z));
    }
    return { group: shadow(g), wheels };
  }
  const truckCols = [0x2a9d8f, 0xe76f51, 0x457b9d, 0xf4a261];
  (cfg.trucks || []).forEach((t0, k) => {
    const m = truckModel(truckCols[k % truckCols.length]);
    scene.add(m.group);
    const tr = { ...m, t0, lane0: k % 2 ? -4 : 4, t: t0, lane: 0, speed: 0, base: 23 + k * 2, dropT: rand(5, 9) };
    const reset = () => { tr.t = tr.t0; tr.lane = tr.lane0; tr.speed = tr.base; tr.dropT = rand(5, 9); };
    resetters.push(reset); reset();
    trucks.push(tr);
  });
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  function updateTrucks(dt, laneFn) {
    for (const tr of trucks) {
      const limit = speedLimit(tr.t, tr.lane, tr);
      const target = Math.min(tr.base, limit);
      tr.speed += clamp(target - tr.speed, -30 * dt, 8 * dt);
      tr.t += (tr.speed * dt) / segLen;
      const want = laneFn ? laneFn(tr.t, tr.lane0) : tr.lane0;
      tr.lane += (want - tr.lane) * Math.min(1, dt * 1.4);
      const i = sampleAt(track, tr.t, tr.group.position);
      const n = normals[i], t = tangents[i];
      tr.group.position.addScaledVector(n, tr.lane);
      tr.group.position.y = heightAtT(track, tr.t);
      tr.group.rotation.set(0, Math.atan2(t.x, t.z), 0);
      tr.group.rotation.x = -Math.atan(track.slopes[i]);
      for (const w of tr.wheels) w.rotation.x += (tr.speed * dt) / 0.55;
      fwd.set(t.x, 0, t.z);
      for (const off of [2.9, 0, -2.9]) {
        solids.push({ pos: tr.group.position.clone().addScaledVector(fwd, off), r: 1.45, kind: 'truck', top: 3.6 });
      }
      // Rơi thùng hàng phía sau xe
      tr.dropT -= dt;
      if (tr.dropT <= 0) {
        tr.dropT = rand(7, 12);
        if (crates.length >= 10) { const old = crates.shift(); scene.remove(old.mesh); }
        const mesh = new THREE.Mesh(crateGeo, [crateMat, crateMat, crateEdge, crateEdge, crateMat, crateMat]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        const pos = tr.group.position.clone().addScaledVector(fwd, -5).add(new THREE.Vector3(rand(-0.6, 0.6), 2.4, 0));
        const vel = fwd.clone().multiplyScalar(tr.speed * 0.55).add(new THREE.Vector3(rand(-1.5, 1.5), 2.5, 0));
        const ground = heightAtT(track, tr.t - 2.5) + 0.55;
        crates.push({ mesh, pos, vel, ground, spin: new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)), knocked: false, rest: false, life: 0 });
        scene.add(mesh);
      }
    }
  }
  function updateCrates(dt) {
    for (let k = crates.length - 1; k >= 0; k--) {
      const c = crates[k];
      c.life += dt;
      if (!c.rest) {
        c.vel.y -= 24 * dt;
        c.pos.addScaledVector(c.vel, dt);
        c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
        if (c.pos.y <= c.ground) {
          c.pos.y = c.ground;
          c.vel.set(c.vel.x * 0.5, -c.vel.y * 0.25, c.vel.z * 0.5);
          c.spin.multiplyScalar(0.5);
          if (c.vel.length() < 0.8) { c.rest = true; c.mesh.rotation.set(0, c.mesh.rotation.y, 0); }
        }
      }
      if (c.knocked && c.rest) { // thùng đã bị tông vỡ: chìm dần rồi biến mất
        c.pos.y -= dt * 0.6;
        if (c.pos.y < c.ground - 1.2) { scene.remove(c.mesh); crates.splice(k, 1); continue; }
      }
      c.mesh.position.copy(c.pos);
      if (!c.knocked) solids.push({ pos: c.pos, r: 0.65, kind: 'crate', top: c.ground + 0.6, ref: c });
    }
  }
  resetters.push(() => { for (const c of crates) scene.remove(c.mesh); crates.length = 0; });

  // =================== ĐÁ LỞ (có vòng đỏ báo trước chỗ đá rơi) ===================
  const rockGeo = new THREE.IcosahedronGeometry(1.5, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a736a, roughness: 1, flatShading: true });
  const warnMat = new THREE.MeshBasicMaterial({ map: makeWarnRing(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -10 });
  const rocks = [];
  for (const ri of cfg.rocks || []) {
    addSign(ri - 40, '🪨', 'ĐÁ LỞ');
    marks.push({ type: 'rock', pos: at(ri, 0) });
    const zone = { i: ri, timer: rand(1, 3) };
    for (let k = 0; k < 3; k++) {
      const mesh = new THREE.Mesh(rockGeo, rockMat); mesh.castShadow = true; mesh.visible = false; scene.add(mesh);
      const warn = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24).rotateX(-Math.PI / 2), warnMat); warn.visible = false; scene.add(warn);
      rocks.push({ zone, mesh, warn, state: 'off', t: 0, pos: new THREE.Vector3(), ground: 0, idx: 0, lat: 0, vlat: 0 });
    }
    updaters.push((dt) => {
      zone.timer -= dt;
      if (zone.timer > 0) return;
      zone.timer = rand(2.2, 4.2);
      const r = rocks.find((x) => x.zone === zone && x.state === 'off');
      if (!r) return;
      r.idx = ri + rand(-14, 14); r.lat = rand(-6.5, 6.5); r.state = 'warn'; r.t = 0;
      at(r.idx, r.lat, r.pos); r.ground = r.pos.y;
      r.warn.position.set(r.pos.x, r.ground + 0.12, r.pos.z); r.warn.visible = true;
    });
  }
  const landed = []; // vị trí đá vừa chạm đất (để tạo bụi, rung màn hình)
  function updateRocks(dt) {
    for (const r of rocks) {
      if (r.state === 'off') continue;
      r.t += dt;
      if (r.state === 'warn') {
        const p = Math.min(1, r.t / 1.7);
        r.warn.scale.setScalar(0.6 + 0.4 * Math.abs(Math.sin(time * 8)));
        r.mesh.visible = true;
        r.mesh.position.set(r.pos.x, r.ground + 1.4 + 45 * (1 - p * p), r.pos.z);
        r.mesh.rotation.x += dt * 3;
        if (p >= 1) { r.state = 'ground'; r.t = 0; r.warn.visible = false; r.vlat = Math.sign(r.lat || 1) * rand(0.8, 1.8); landed.push(r.mesh.position.clone()); }
      } else if (r.state === 'ground') {
        r.lat += r.vlat * dt;
        at(r.idx, r.lat, r.pos);
        r.mesh.position.set(r.pos.x, r.pos.y + 1.3, r.pos.z);
        r.mesh.rotation.z -= r.vlat * dt / 1.5;
        solids.push({ pos: r.mesh.position, r: 1.5, kind: 'rock', top: r.pos.y + 2.6 });
        if (r.t > 6 || Math.abs(r.lat) > WALL_DIST - 2) { r.state = 'sink'; r.t = 0; }
      } else if (r.state === 'sink') {
        r.mesh.position.y -= dt * 2.5;
        if (r.t > 1.2) { r.state = 'off'; r.mesh.visible = false; }
      }
    }
  }
  resetters.push(() => { for (const r of rocks) { r.state = 'off'; r.mesh.visible = false; r.warn.visible = false; } });

  // =================== Ổ GÀ ===================
  const potMat = new THREE.MeshStandardMaterial({ map: makePothole(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -6 });
  const potholes = [];
  for (const pi of cfg.potholes || []) {
    for (let k = 0; k < 3; k++) {
      const i0 = wrap(pi + Math.round(rand(-4, 4)) + k * 3), lat = rand(-6, 6);
      const g = ribbon(track, lat - 1.2, lat + 1.2, 0.09, 0.09, 1, { i0, i1: i0 + 1, vFn: (q) => q - i0 });
      const m = new THREE.Mesh(g, potMat); m.receiveShadow = true; scene.add(m);
      potholes.push({ pos: at(i0 + 0.5, lat), r: 1.15 });
    }
    marks.push({ type: 'pothole', pos: at(pi, 0) });
  }

  // =================== MƯA RÀO (đường trơn) ===================
  const rainZones = cfg.rain || [];
  const inRain = (idx) => rainZones.some(([a, b]) => ahead(a, idx) <= ahead(a, b));
  let rain = null, rainAmt = 0;
  const baseFog = scene.fog ? { color: scene.fog.color.clone(), far: scene.fog.far } : null;
  const rainFog = new THREE.Color(0x5d6872);
  if (rainZones.length) {
    for (const [a, b] of rainZones) {
      const wet = new THREE.Mesh(ribbon(track, -ROAD_HALF, ROAD_HALF, 0.06, 0.06, 16, { i0: a, i1: b }),
        new THREE.MeshStandardMaterial({ color: 0x1c2733, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -5 }));
      scene.add(wet);
      marks.push({ type: 'rain', i0: a, i1: b });
    }
    const COUNT = 1400, pos = new Float32Array(COUNT * 6);
    for (let k = 0; k < COUNT; k++) {
      const x = rand(-40, 40), y = rand(0, 30), z = rand(-40, 40);
      pos.set([x, y, z, x + 0.15, y + 1.1, z], k * 6);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc8d6e8, transparent: true, opacity: 0, depthWrite: false }));
    rain.frustumCulled = false; scene.add(rain);
  }
  function updateRain(dt, camera, playerIdx) {
    if (!rain) return;
    rainAmt += ((inRain(playerIdx) ? 1 : 0) - rainAmt) * Math.min(1, dt * 1.5);
    rain.visible = rainAmt > 0.02;
    rain.material.opacity = 0.55 * rainAmt;
    if (baseFog && scene.fog) {
      scene.fog.color.copy(baseFog.color).lerp(rainFog, rainAmt * (scene.background ? 0.3 : 0.65));
      scene.fog.far = baseFog.far - (baseFog.far - 520) * rainAmt;
    }
    if (!rain.visible) return;
    rain.position.set(camera.position.x, camera.position.y - 12, camera.position.z);
    const p = rain.geometry.attributes.position.array;
    for (let k = 0; k < p.length; k += 6) {
      p[k + 1] -= 40 * dt; p[k + 4] -= 40 * dt;
      if (p[k + 1] < 0) { p[k + 1] += 30; p[k + 4] += 30; }
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }

  // =================== XU VÀNG ===================
  const coinList = [];
  for (const [ci, lane, pattern] of cfg.coins || []) {
    for (let k = 0; k < 7; k++) {
      let lat = lane;
      if (pattern === 'zigzag') lat = lane + Math.sin(k * 0.9) * 3;
      if (pattern === 'cross') lat = -5 + (k / 6) * 10;
      const p = at(ci + k * 2.4, clamp(lat, -ROAD_HALF + 1, ROAD_HALF - 1)); p.y += 1.1;
      coinList.push({ pos: p, taken: false });
    }
  }
  const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 18).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.85, roughness: 0.25, emissive: 0x7a4a00, emissiveIntensity: 0.6 }), Math.max(1, coinList.length));
  coinMesh.count = coinList.length; coinMesh.castShadow = true;
  scene.add(coinMesh);
  const cd = new THREE.Object3D();
  function updateCoins() {
    coinList.forEach((c, k) => {
      cd.position.copy(c.pos); cd.position.y += Math.sin(time * 3 + k) * 0.12;
      cd.rotation.set(0, time * 3 + k * 0.3, 0);
      cd.scale.setScalar(c.taken ? 0 : 1);
      cd.updateMatrix(); coinMesh.setMatrixAt(k, cd.matrix);
    });
    coinMesh.instanceMatrix.needsUpdate = true;
  }
  resetters.push(() => { for (const c of coinList) c.taken = false; });

  // =================== VÒNG LỬA TRÊN DỐC NHẢY ===================
  const rings = [];
  for (const [ji] of jumps) {
    const f = frameAt(ji + 10);
    const top = heights[wrap(ji + 10)];
    f.position.y = top + 3.8;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.22, 10, 32), new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xff5a00, emissiveIntensity: 1.4, roughness: 0.4 }));
    f.add(ring);
    rings.push({ group: f, ring, cool: 0 });
  }
  function updateRings(dt) {
    for (const r of rings) {
      r.cool = Math.max(0, r.cool - dt);
      r.ring.rotation.z = time * 1.5;
      r.ring.material.emissiveIntensity = r.cool > 0 ? 0.3 : 1.2 + Math.sin(time * 6) * 0.4;
    }
  }

  // =================== Giới hạn tốc độ cho xe máy điều khiển / xe tải ===================
  // Dừng trước chắn tàu khi chắn hạ, chờ trâu qua đường, không đâm vào đuôi xe tải
  function speedLimit(t, lane, self) {
    let lim = Infinity;
    for (const b of cfg._blockers || []) {
      const d = ahead(t, b.i);
      if (d < 45 && b.blocks(t, lane)) lim = Math.min(lim, Math.sqrt(2 * 22 * Math.max(0, (d - 7) * segLen)));
    }
    for (const tr of trucks) {
      if (tr === self) continue;
      const d = ahead(t, tr.t);
      if (d > 0.5 && d < 9 && Math.abs(lane - tr.lane) < 3) lim = Math.min(lim, tr.speed);
    }
    return lim;
  }
  // Xe máy điều khiển đổi làn để vượt xe tải phía trước
  function laneAdjust(t, want) {
    for (const tr of trucks) {
      const d = ahead(t, tr.t);
      if (d < 28 || d > N - 5) {
        if (Math.abs(want - tr.lane) < 3.8) {
          const left = tr.lane - 4.4, right = tr.lane + 4.4, lim = ROAD_HALF - 1.6;
          want = (want >= tr.lane && right <= lim) || left < -lim ? right : left;
        }
      }
    }
    return want;
  }

  // =================== Va chạm với xe người chơi ===================
  const ev = { coins: 0, shake: 0, msg: null, boost: 0, sparkle: [], dust: [] };
  function collide(r, idx, dt) {
    ev.coins = 0; ev.shake = 0; ev.msg = null; ev.boost = 0; ev.sparkle.length = 0;
    r.potCool = Math.max(0, (r.potCool || 0) - dt);
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
    // Vật cản cứng
    for (const o of solids) {
      const ox = o.pos.x - r.pos.x, oz = o.pos.z - r.pos.z;
      if (ox * ox + oz * oz > 100 || r.y > o.top) continue;
      for (const off of [1.3, -1.3]) {
        let dx = r.pos.x + fx * off - o.pos.x, dz = r.pos.z + fz * off - o.pos.z;
        const d = Math.hypot(dx, dz), min = 1.05 + o.r;
        if (d >= min || d < 1e-4) continue;
        dx /= d; dz /= d;
        if (o.kind === 'crate') {
          const c = o.ref; c.knocked = true; c.rest = false;
          c.vel.set(r.vel.x * 0.8 - dx * 3, 4 + r.vel.length() * 0.06, r.vel.z * 0.8 - dz * 3);
          c.spin.set(rand(-8, 8), rand(-5, 5), rand(-8, 8));
          r.vel.multiplyScalar(0.9); ev.shake += 0.15; ev.msg = ['📦 TÔNG VỠ THÙNG HÀNG!', '#e9c46a'];
          break;
        }
        r.pos.x += dx * (min - d); r.pos.z += dz * (min - d);
        const vn = r.vel.x * dx + r.vel.z * dz;
        if (vn < 0) {
          r.vel.x -= dx * vn * 1.3; r.vel.z -= dz * vn * 1.3;
          r.vel.multiplyScalar(o.kind === 'buffalo' ? 0.55 : o.kind === 'rock' ? 0.65 : 0.75);
          ev.shake += Math.min(0.8, Math.abs(vn) * 0.05);
          ev.msg = o.kind === 'buffalo' ? ['🐃 ĐÂM PHẢI TRÂU!', '#ff9f43'] : o.kind === 'rock' ? ['🪨 ĐÂM VÀO ĐÁ!', '#ff9f43'] : ['🚚 ĐÂM ĐUÔI XE TẢI!', '#ff9f43'];
        }
        const cross = fx * dz - fz * dx;
        if (Math.abs(cross) < 0.35) { const s = cross >= 0 ? 1 : -1; r.vel.x += -fz * s * 4; r.vel.z += fx * s * 4; }
      }
    }
    // Tàu hoả: đâm vào thì bị hất lùi lại, mất hết tốc độ
    for (const c of trains) {
      if (c.front < -900) continue; // tàu chưa chạy
      const k = wrap(c.i), t = tangents[k], n = normals[k], p = samples[k];
      const u = (r.pos.x - p.x) * t.x + (r.pos.z - p.z) * t.z;
      const l = ((r.pos.x - p.x) * n.x + (r.pos.z - p.z) * n.z) * c.dir;
      if (Math.abs(u) < 3.9 && l < c.front + 1.5 && l > c.front - c.LEN - 1.5) {
        const s = u < 0 ? -1 : 1, push = s * 3.9 - u;
        r.pos.x += t.x * push; r.pos.z += t.z * push;
        const vt = r.vel.x * t.x + r.vel.z * t.z;
        r.vel.x -= t.x * vt * 1.4; r.vel.z -= t.z * vt * 1.4;
        r.vel.multiplyScalar(0.3);
        ev.shake += 0.9; ev.msg = ['🚂 BỊ TÀU HẤT VĂNG!', '#ff4d6d'];
      }
    }
    // Ổ gà: xe nảy lên, chậm lại
    if (!r.air && r.potCool <= 0) {
      for (const h of potholes) {
        const dx = h.pos.x - r.pos.x, dz = h.pos.z - r.pos.z;
        if (dx * dx + dz * dz < h.r * h.r) {
          const sp = r.vel.length();
          r.vy = 2 + Math.min(4.5, sp * 0.08); r.air = true; r.vel.multiplyScalar(0.9);
          r.potCool = 0.5; ev.shake += 0.3; ev.msg = ['🕳 SẬP Ổ GÀ!', '#d4a373'];
          break;
        }
      }
    }
    // Xu vàng
    for (const c of coinList) {
      if (c.taken) continue;
      const dx = c.pos.x - r.pos.x, dz = c.pos.z - r.pos.z, dy = c.pos.y - (r.y + 0.8);
      if (dx * dx + dz * dz < 4.4 && Math.abs(dy) < 1.8) { c.taken = true; ev.coins++; ev.sparkle.push(c.pos); }
    }
    // Vòng lửa: bay xuyên qua để được tăng tốc và thưởng xu
    for (const g of rings) {
      if (g.cool > 0) continue;
      const p = g.group.position, d = Math.hypot(p.x - r.pos.x, p.y - (r.y + 0.8), p.z - r.pos.z);
      if (d < 2.6) { g.cool = 6; ev.boost = 1.5; ev.coins += 5; ev.msg = ['🔥 XUYÊN VÒNG LỬA! +5 xu', '#ffd166']; ev.sparkle.push(p); }
    }
    return ev;
  }

  // Cảnh báo sớm trên màn hình khi sắp tới chỗ nguy hiểm
  function warning(idx) {
    for (const c of trains) { const d = ahead(idx, c.i); if (d < 110 && c.down) return ['🚂 TÀU SẮP QUA — CHẮN ĐANG HẠ!', '#ff4d6d']; }
    for (const b of cfg._blockers || []) { if (b.herd && b.state === 'walk' && ahead(idx, b.i) < 70) return ['🐃 TRÂU ĐANG QUA ĐƯỜNG!', '#ff9f43']; }
    for (const r of rocks) if (r.state === 'warn' && ahead(idx, r.idx) < 60) return ['🪨 CẨN THẬN ĐÁ LỞ!', '#ff9f43'];
    if (inRain(idx)) return ['🌧 MƯA RÀO — ĐƯỜNG TRƠN', '#8ecae6'];
    return null;
  }

  return {
    solids, marks, trucks, trains, rings, coinList,
    get landed() { return landed; },
    inRain, speedLimit, laneAdjust, collide, warning,
    totalCoins: () => coinList.length,
    update(dt, laneFn) {
      time += dt;
      solids.length = 0; landed.length = 0;
      for (const f of updaters) f(dt);
      updateTrucks(dt, laneFn);
      updateCrates(dt);
      updateRocks(dt);
      updateCoins();
      updateRings(dt);
    },
    present(dt, camera, playerIdx) { updateRain(dt, camera, playerIdx); },
    reset() { for (const f of resetters) f(); },
  };
}
