// Cảnh vật cho từng chặng: bầu trời, ánh sáng, mặt đất, cây, nhà, biển, thành phố, người xem...
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeGrass, makeChecker, makeBanner, makeSand, makeConcrete, makeSea, makeWindows, makeNeon, makeGlow } from './textures.js';
import { ROAD_HALF, WALL_DIST, BANK_W, ribbon } from './track.js';
import { Crowd, createFlagman } from './people.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const deg = THREE.MathUtils.degToRad;

// Thông số ánh sáng của từng kiểu cảnh
const THEMES = {
  sunset: {
    sky: { phi: 85, theta: 200, turbidity: 9, rayleigh: 3.2, mie: 0.008 },
    fog: [0xe0a07a, 320, 1900], hemi: [0xffd2b0, 0x4a6b3a, 0.6], sun: [0xffb27a, 2.8], env: 0.8,
    exposure: 0.55, ground: () => makeGrass(), repeat: 380, roof: 0xef476f,
  },
  beach: {
    sky: { phi: 42, theta: 165, turbidity: 3, rayleigh: 1.1, mie: 0.004 },
    fog: [0xcde6f2, 450, 2600], hemi: [0xe3f3ff, 0xd8c08a, 0.75], sun: [0xfff2dc, 2.5], env: 0.9,
    exposure: 0.42, ground: () => makeGrass(), repeat: 380, roof: 0x1d8fe1,
  },
  night: {
    sky: null, bg: 0x060916, moon: { phi: 55, theta: 140 },
    fog: [0x0c1124, 180, 1400], hemi: [0x8090c8, 0x1c1c26, 0.7], sun: [0xa9bcff, 1.0], env: 0.3,
    exposure: 0.9, ground: () => makeConcrete('#2b2d33'), repeat: 520, roof: 0x9b5de5,
  },
};
export const exposureOf = (theme) => THEMES[theme].exposure;

export function buildWorld(scene, renderer, track, stage) {
  const T = THEMES[stage.theme];
  const updaters = []; // các hàm chạy mỗi khung hình (mây bay, sóng, khán giả...)
  const dummy = new THREE.Object3D(), col = new THREE.Color();

  // ---------- Bầu trời + ánh sáng ----------
  const sunDir = new THREE.Vector3();
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (T.sky) {
    sunDir.setFromSphericalCoords(1, deg(T.sky.phi), deg(T.sky.theta));
    const setupSky = (sky) => {
      sky.scale.setScalar(10000);
      const u = sky.material.uniforms;
      u.turbidity.value = T.sky.turbidity; u.rayleigh.value = T.sky.rayleigh;
      u.mieCoefficient.value = T.sky.mie; u.mieDirectionalG.value = 0.9;
      u.sunPosition.value.copy(sunDir);
      return sky;
    };
    scene.add(setupSky(new Sky()));
    const envScene = new THREE.Scene();
    envScene.add(setupSky(new Sky()));
    scene.environment = pmrem.fromScene(envScene).texture;
  } else {
    sunDir.setFromSphericalCoords(1, deg(T.moon.phi), deg(T.moon.theta));
    scene.background = new THREE.Color(T.bg);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  scene.environmentIntensity = T.env;
  scene.fog = new THREE.Fog(...T.fog);
  scene.add(new THREE.HemisphereLight(...T.hemi));

  const sun = new THREE.DirectionalLight(...T.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 420 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---------- Kích thước khu vực đường đua ----------
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of track.samples) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const spread = Math.max(maxX - minX, maxZ - minZ) / 2 + 260;
  const S = (stage.scale ?? 1.5) / 1.5, S2 = S * S; // đường lớn hơn thì cảnh vật trải rộng và nhiều hơn

  // Chỗ trống để đặt cây / nhà: không đè lên đường và không đè lên vật đã đặt trước
  const blocked = [];
  const freeSpot = (x, z, margin) => {
    const m2 = margin * margin;
    for (let i = 0; i < track.N; i += 4) {
      const s = track.samples[i], dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < m2) return false;
    }
    for (const b of blocked) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return false;
    return true;
  };
  const randomSpot = (margin, r = spread, test = () => true) => {
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (test(x, z) && freeSpot(x, z, margin)) return [x, z];
    }
    return null;
  };

  // ---------- Mặt đất ----------
  const groundTex = T.ground();
  groundTex.repeat.set(T.repeat, T.repeat);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.35, cz);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- Khung đặt đồ vật theo đường: trục x = phương ngang đường, trục z = hướng chạy ----------
  const frameAt = (i, side = 1, parent = scene) => {
    const g = new THREE.Group();
    const t = track.tangents[i], p = track.samples[i];
    g.position.set(p.x, track.heights[i], p.z);
    g.rotation.y = Math.atan2(t.x, t.z) + (side < 0 ? Math.PI : 0);
    parent.add(g);
    return g;
  };
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d42, metalness: 0.7, roughness: 0.35 });
  const crowd = new Crowd();

  // ---------- Cổng xuất phát + vạch đích + người cầm cờ ----------
  const gate = frameAt(0);
  const checker = makeChecker(16, 2);
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.4), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4 }));
  startLine.rotation.x = -Math.PI / 2; startLine.position.y = 0.06; startLine.receiveShadow = true;
  gate.add(startLine);
  for (const x of [-(ROAD_HALF + 2.5), ROAD_HALF + 2.5]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), metal);
    pillar.position.set(x, 4.5, 0); pillar.castShadow = true; gate.add(pillar);
  }
  const bannerTex = makeBanner(stage.banner);
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: T.sky ? 0.35 : 0.9, roughness: 0.6 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 6, 2, 0.8), [metal, metal, metal, metal, bannerMat, bannerMat]);
  beam.position.y = 9; beam.castShadow = true; gate.add(beam);
  const flagman = createFlagman(makeChecker(4, 3));
  const fmFrame = frameAt(6);
  fmFrame.add(flagman.group);
  flagman.group.position.x = ROAD_HALF + 2.4;
  flagman.group.rotation.y = -Math.PI / 2;

  // ---------- Khán đài có khán giả ----------
  const stand = frameAt(45, -1);
  stand.translateX(WALL_DIST + 3);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x8d99ae, roughness: 0.8 });
  for (let j = 0; j < 6; j++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8 * (j + 1), 34), standMat);
    step.position.set(j * 2, 0.4 * (j + 1), 0); step.castShadow = true; step.receiveShadow = true; stand.add(step);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 36), new THREE.MeshStandardMaterial({ color: T.roof, roughness: 0.5 }));
  roof.position.set(5, 8.5, 0); roof.castShadow = true; stand.add(roof);
  for (const z of [-17, 17]) for (const x of [-1, 11]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8.5, 0.4), metal);
    post.position.set(x, 4.25, z); stand.add(post);
  }
  stand.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  for (let j = 0; j < 6; j++) for (let z = -16; z <= 16; z += 0.85) {
    if (Math.random() > 0.82) continue;
    wp.set(j * 2 + rand(-0.3, 0.3), 0.8 * (j + 1), z);
    stand.localToWorld(wp);
    crowd.add(wp.x, wp.y, wp.z, stand.rotation.y - Math.PI / 2);
  }

  // ---------- Cờ dọc đường đua ----------
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 6).translate(0, 2.5, 0);
  const flagGeo = new THREE.BoxGeometry(0.05, 1, 1.5).translate(0, 4.4, 0.78);
  const flagMats = [0xffd166, 0x06d6a0, 0x118ab2, 0xef476f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  for (let i = 10, k = 0; i < track.N; i += 50, k++) {
    const f = frameAt(i);
    f.translateX((k % 2 ? 1 : -1) * (WALL_DIST + 1.5));
    f.add(new THREE.Mesh(poleGeo, metal));
    const flag = new THREE.Mesh(flagGeo, flagMats[k % 4]);
    flag.castShadow = true; f.add(flag);
  }

  // ---------- Khán giả đứng dọc hai bên đường (trên sườn đất ngoài tường chắn) ----------
  // Mỗi nhóm đứng trên một bục gỗ 2 bậc, cao hơn tường chắn để nhìn rõ đường đua
  const deckGeos = [];
  for (let i = 165, k = 0; i < 920; i += 70, k++) {
    const side = k % 2 ? 1 : -1;
    const f = frameAt(i, side);
    for (const [x, top, w] of [[WALL_DIST + 2.6, 0.55, 3.2], [WALL_DIST + 5.6, 1.35, 3.2]]) {
      const box = new THREE.BoxGeometry(w, top + 8, 18).translate(x, top - (top + 8) / 2, 0);
      f.updateMatrixWorld(true);
      deckGeos.push(box.applyMatrix4(f.matrixWorld));
    }
    f.updateMatrixWorld(true);
    for (let z = -8; z <= 8; z += 1.05) for (const [x, top] of [[WALL_DIST + 2.6, 0.55], [WALL_DIST + 5.6, 1.35]]) {
      if (Math.random() < 0.25) continue;
      wp.set(x + rand(-0.4, 0.4), top, z + rand(-0.2, 0.2));
      f.localToWorld(wp);
      crowd.add(wp.x, wp.y, wp.z, f.rotation.y - Math.PI / 2 + rand(-0.35, 0.35));
    }
    scene.remove(f);
  }
  const decks = new THREE.Mesh(mergeGeometries(deckGeos), new THREE.MeshStandardMaterial({ color: stage.theme === 'night' ? 0x4a4f5c : 0x9a7048, roughness: 0.9 }));
  decks.castShadow = true; decks.receiveShadow = true; scene.add(decks);

  // ---------- Cầu vượt cho người đi bộ, có khán giả đứng xem ----------
  {
    const bi = 120, br = frameAt(bi);
    const span = WALL_DIST * 2 + 10, deckY = 9.5;
    const concrete = new THREE.MeshStandardMaterial({ color: stage.theme === 'night' ? 0x5a5e6a : 0xd8d2c4, roughness: 0.85 });
    const rail = new THREE.MeshStandardMaterial({ color: T.roof, roughness: 0.5, metalness: 0.3 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; br.add(o); };
    add(new THREE.BoxGeometry(span, 0.8, 4), concrete, 0, deckY, 0);
    for (const z of [-1.9, 1.9]) add(new THREE.BoxGeometry(span, 1.1, 0.15), rail, 0, deckY + 0.95, z);
    for (const x of [-span / 2 + 1.5, span / 2 - 1.5]) add(new THREE.BoxGeometry(1.6, deckY + 10, 3.2), concrete, x, (deckY - 10) / 2, 0);
    br.updateMatrixWorld(true);
    for (let x = -span / 2 + 3; x < span / 2 - 3; x += 1.1) {
      if (Math.random() < 0.3) continue;
      for (const z of [-1.2, 1.2]) {
        if (Math.random() < 0.4) continue;
        wp.set(x + rand(-0.2, 0.2), deckY + 0.4, z);
        br.localToWorld(wp);
        crowd.add(wp.x, wp.y, wp.z, br.rotation.y + (z < 0 ? Math.PI : 0));
      }
    }
  }

  // ---------- Núi xa ----------
  const makeMountain = (radius, h, low, mid, snow) => {
    const g = new THREE.ConeGeometry(radius, h, 11, 6);
    const p = g.attributes.position, cols = [];
    const seed = Math.random() * 100;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (y + h / 2) / h;
      if (k > 0.01 && k < 0.99) {
        const n = Math.sin(x * 0.031 + seed) * Math.cos(z * 0.027 + seed * 1.7) + Math.sin((x + z) * 0.05 + seed);
        const s = 1 + n * 0.16;
        p.setXYZ(i, x * s, y + n * h * 0.04, z * s);
      }
      const c = k < 0.55 ? low.clone().lerp(mid, k / 0.55) : mid.clone().lerp(snow, h > 230 && k > 0.78 ? 1 : (k - 0.55) * 0.6);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  };
  const mountainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const mountains = (count, rMin, rMax, hMin, hMax, colors, arc = [0, Math.PI * 2], y0 = -5) => {
    const [low, mid, snow] = colors.map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      const a = arc[0] + ((i + rand(-0.3, 0.3)) / count) * (arc[1] - arc[0]), r = rand(rMin, rMax), h = rand(hMin, hMax);
      const m = new THREE.Mesh(makeMountain(rand(160, 280) * (h / 260), h, low, mid, snow), mountainMat);
      m.position.set(cx + Math.cos(a) * r, h / 2 + y0, cz + Math.sin(a) * r);
      m.rotation.y = Math.random() * Math.PI;
      scene.add(m);
    }
  };

  // ---------- Mây ----------
  const clouds = (count, color, emissive) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, emissive, emissiveIntensity: 0.25 });
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const p = new THREE.Mesh(puff, mat);
        p.position.set(rand(-40, 40), rand(-6, 8), rand(-15, 15));
        p.scale.setScalar(rand(14, 26));
        g.add(p);
      }
      const a = Math.random() * Math.PI * 2, r = rand(300, 1000);
      g.position.set(cx + Math.cos(a) * r, rand(220, 330), cz + Math.sin(a) * r);
      scene.add(g);
      const sp = rand(1.5, 4);
      updaters.push((dt) => { g.position.x += sp * dt; if (g.position.x > cx + 1300) g.position.x = cx - 1300; });
    }
  };

  // Cây (instancing): spots = danh sách [x, z]
  const plantTrees = (spots, pineShare, palette) => {
    const pineGeo = mergeGeometries([
      new THREE.ConeGeometry(2.7, 6, 7).translate(0, 5.5, 0),
      new THREE.ConeGeometry(2.0, 4.6, 7).translate(0, 8.4, 0),
    ]);
    const roundGeo = new THREE.IcosahedronGeometry(3.1, 0).translate(0, 5.6, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.5, 3.4, 6).translate(0, 1.7, 0);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 1 });
    const nPine = Math.round(spots.length * pineShare), nRound = spots.length - nPine;
    const pines = new THREE.InstancedMesh(pineGeo, leafMat, Math.max(1, nPine));
    const rounds = new THREE.InstancedMesh(roundGeo, leafMat, Math.max(1, nRound));
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    pines.count = nPine; rounds.count = nRound;
    spots.forEach(([x, z], i) => {
      dummy.position.set(x, -0.3, z);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.scale.setScalar(rand(0.75, 1.6));
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      col.set(pick(palette));
      if (i < nPine) { pines.setMatrixAt(i, dummy.matrix); pines.setColorAt(i, col); }
      else { rounds.setMatrixAt(i - nPine, dummy.matrix); rounds.setColorAt(i - nPine, col); }
    });
    for (const m of [pines, rounds, trunks]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  };

  // ========== CẢNH RIÊNG CỦA TỪNG CHẶNG ==========
  if (stage.theme === 'sunset') {
    // Hồ nước giữa vòng đua
    let lakeR = Infinity;
    for (const s of track.samples) lakeR = Math.min(lakeR, Math.hypot(s.x - cx, s.z - cz));
    lakeR = Math.min(90, lakeR - 50);
    if (lakeR > 20) {
      const lakeTex = makeSea(); lakeTex.repeat.set(10, 10);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(lakeR, 48), new THREE.MeshStandardMaterial({ map: lakeTex, color: 0xc4e2f2, roughness: 0.08, metalness: 0.1 }));
      lake.rotation.x = -Math.PI / 2; lake.position.set(cx, -0.27, cz); lake.receiveShadow = true;
      scene.add(lake);
      blocked.push({ x: cx, z: cz, r: lakeR + 6 });
      updaters.push((dt) => { lakeTex.offset.x += dt * 0.01; });
    }
    // Hai ngôi làng nhỏ: nhà tường vàng nhạt, mái ngói đỏ
    const houseGeos = [];
    const tintGeo = (g, hex) => { const c = new THREE.Color(hex), arr = []; for (let i = 0; i < g.attributes.position.count; i++) arr.push(c.r, c.g, c.b); g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3)); return g; };
    for (let v = 0; v < 2; v++) {
      const center = randomSpot(90, spread * 0.85);
      if (!center) continue;
      for (let h = 0; h < 10; h++) {
        const a = Math.random() * Math.PI * 2, d = rand(6, 34);
        const x = center[0] + Math.cos(a) * d, z = center[1] + Math.sin(a) * d;
        if (!freeSpot(x, z, 45)) continue;
        const w = rand(6, 9), dd = rand(5, 7), hh = rand(3.2, 4.5), rot = Math.random() * Math.PI;
        const parts = [
          tintGeo(new THREE.BoxGeometry(w, hh, dd).translate(0, hh / 2 - 0.3, 0), pick(['#f1e3c6', '#e9d8b4', '#f5ecd9', '#dcc9a3'])),
          tintGeo(new THREE.ConeGeometry(Math.hypot(w, dd) / 2 + 0.4, 2.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, dd / w).translate(0, hh + 1.0, 0), pick(['#b5462d', '#9c3b26', '#c4572f'])),
          tintGeo(new THREE.BoxGeometry(1.1, 2, 0.1).translate(0, 0.7, dd / 2 + 0.05), '#5a3d26'),
          tintGeo(new THREE.BoxGeometry(1, 0.9, 0.1).translate(w / 4 + 0.4, hh * 0.55, dd / 2 + 0.05), '#3b5878'),
          tintGeo(new THREE.BoxGeometry(1, 0.9, 0.1).translate(-w / 4 - 0.4, hh * 0.55, dd / 2 + 0.05), '#3b5878'),
        ];
        houseGeos.push(mergeGeometries(parts).rotateY(rot).translate(x, 0, z));
        blocked.push({ x, z, r: 7 });
      }
    }
    if (houseGeos.length) {
      const houses = new THREE.Mesh(mergeGeometries(houseGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
      houses.castShadow = true; houses.receiveShadow = true; scene.add(houses);
    }
    // Rừng cây
    const spots = [];
    for (let k = 0; k < 520 * S2; k++) { const s = randomSpot(WALL_DIST + BANK_W + 3, 560 * S); if (s) spots.push(s); }
    plantTrees(spots, 0.58, ['#2f6b2a', '#3d7f33', '#4f8f3a', '#6a9b3f', '#3f6e2c', '#2f6b2a', '#c46a2b', '#d9a03a']);
    mountains(20, 880 * S, 1200 * S, 150, 340, [0x4a4470, 0x8a6a9a, stage.noSnow ? 0x9d86ad : 0xfbeef0]);
    clouds(16, 0xfff1e6, 0x553322);
    // Khinh khí cầu bay lơ lửng
    const balloonCols = [['#ef476f', '#ffd166'], ['#06d6a0', '#118ab2'], ['#ff9f1c', '#ffffff'], ['#9b5de5', '#f15bb5'], ['#e63946', '#f1faee']];
    balloonCols.forEach(([a, b], k) => {
      const env = new THREE.SphereGeometry(9, 16, 12).scale(1, 1.2, 1);
      const p = env.attributes.position, cols = [], ca = new THREE.Color(a), cb = new THREE.Color(b);
      for (let i = 0; i < p.count; i++) {
        const ang = Math.atan2(p.getZ(i), p.getX(i));
        const c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2 ? ca : cb;
        cols.push(c.r, c.g, c.b);
      }
      env.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const g = new THREE.Group();
      g.add(new THREE.Mesh(env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true })));
      const basket = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.4), new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 }));
      basket.position.y = -15; g.add(basket);
      const a0 = (k / balloonCols.length) * Math.PI * 2, r = rand(250, 480) * S, y0 = rand(70, 140);
      scene.add(g);
      updaters.push((dt, t) => {
        const a = a0 + t * 0.006;
        g.position.set(cx + Math.cos(a) * r, y0 + Math.sin(t * 0.3 + k) * 6, cz + Math.sin(a) * r);
      });
    });
  }

  if (stage.theme === 'beach') {
    // Biển nằm phía nam đoạn đường xuất phát (z âm), giữa là bãi cát
    const shore = minZ - 62;
    const seaTex = makeSea(); seaTex.repeat.set(320, 160);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 4000), new THREE.MeshStandardMaterial({ map: seaTex, color: 0xb8dcf0, roughness: 0.35, metalness: 0, envMapIntensity: 0.4 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(cx, -0.26, shore - 2000); sea.receiveShadow = true;
    scene.add(sea);
    const shallow = new THREE.Mesh(new THREE.PlaneGeometry(8000, 30), new THREE.MeshStandardMaterial({ color: 0x5fd6c8, transparent: true, opacity: 0.75, roughness: 0.2, depthWrite: false }));
    shallow.rotation.x = -Math.PI / 2; shallow.position.set(cx, -0.22, shore - 15);
    scene.add(shallow);
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(8000, 1.6), foamMat);
    foam.rotation.x = -Math.PI / 2; foam.position.set(cx, -0.2, shore - 0.5);
    scene.add(foam);
    updaters.push((dt, t) => {
      seaTex.offset.set(t * 0.004, t * 0.008);
      foam.position.z = shore - 1.5 + Math.sin(t * 0.8) * 1.5;
      foamMat.opacity = 0.45 + Math.sin(t * 0.8) * 0.25;
    });
    const onLand = (x, z) => z > shore + 6;
    // Bãi cát dọc bờ biển (đất liền phía trong là cỏ)
    const beachTex = makeSand('#ead6a4'); beachTex.repeat.set(400, 3);
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(8000, minZ - 14 - shore), new THREE.MeshStandardMaterial({ map: beachTex, roughness: 1 }));
    beach.rotation.x = -Math.PI / 2; beach.position.set(cx, -0.32, (shore + minZ - 14) / 2); beach.receiveShadow = true;
    scene.add(beach);

    // Ô dù, khăn tắm và người tắm biển trên bãi cát
    const nU = Math.floor((maxX - minX + 200) / 13);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: 0xffffff }), nU);
    const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(2.1, 0.8, 10, 1, true).translate(0, 2.7, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }), nU);
    const towels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), nU);
    const umbCols = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#ff9f1c', '#f1faee'];
    let u = 0;
    for (let x = minX - 100; x < maxX + 100 && u < nU; x += rand(10, 16)) {
      const z = rand(shore + 6, minZ - WALL_DIST - BANK_W - 4);
      if (!freeSpot(x, z, WALL_DIST + BANK_W + 3)) continue;
      dummy.position.set(x, -0.35, z); dummy.rotation.set(0, 0, rand(-0.1, 0.1)); dummy.scale.setScalar(1); dummy.updateMatrix();
      poles.setMatrixAt(u, dummy.matrix); tops.setMatrixAt(u, dummy.matrix); tops.setColorAt(u, col.set(pick(umbCols)));
      dummy.position.set(x + 1.4, -0.32, z + rand(-0.5, 0.5)); dummy.rotation.set(0, rand(-0.3, 0.3), 0); dummy.updateMatrix();
      towels.setMatrixAt(u, dummy.matrix); towels.setColorAt(u, col.set(pick(umbCols)));
      for (let p = 0; p < 1 + Math.floor(Math.random() * 2); p++) crowd.add(x + rand(-2.5, 2.5), -0.35, z + rand(-2.5, 2.5), rand(0, 6.28), { calm: true, up: Math.random() < 0.3 });
      blocked.push({ x, z, r: 4 });
      u++;
    }
    for (const m of [poles, tops, towels]) { m.count = u; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    // Người đang tắm dưới nước (chỉ thấy nửa người)
    for (let k = 0; k < 40; k++) crowd.add(rand(minX - 80, maxX + 80), -1.25, rand(shore - 28, shore - 4), rand(0, 6.28), { calm: true, amp: 0.3 });

    // Hàng dừa
    const trunkParts = [];
    for (let s = 0; s < 5; s++) trunkParts.push(new THREE.CylinderGeometry(0.28 - s * 0.03, 0.32 - s * 0.03, 2.2, 7).translate(s * s * 0.09, 1.1 + s * 2.05, 0));
    const trunkGeo = mergeGeometries(trunkParts);
    const leafParts = [];
    for (let l = 0; l < 8; l++) {
      leafParts.push(new THREE.BoxGeometry(1.1, 0.08, 4.6).translate(0, 0, 2.3).rotateX(0.45 + (l % 2) * 0.25).rotateY((l / 8) * Math.PI * 2).translate(1.6, 10.6, 0));
    }
    leafParts.push(new THREE.SphereGeometry(0.3, 6, 5).translate(1.9, 10.2, 0.3), new THREE.SphereGeometry(0.3, 6, 5).translate(1.4, 10.2, -0.3));
    const leafGeo = mergeGeometries(leafParts);
    const palmSpots = [];
    for (let k = 0; k < 480 * S2; k++) { const s = randomSpot(WALL_DIST + BANK_W + 3, 560 * S, onLand); if (s) palmSpots.push(s); }
    const palmTrunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1, flatShading: true }), palmSpots.length);
    const palmLeaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), palmSpots.length);
    palmSpots.forEach(([x, z], i) => {
      dummy.position.set(x, -0.35, z); dummy.rotation.set(0, Math.random() * Math.PI * 2, 0); dummy.scale.setScalar(rand(0.8, 1.3)); dummy.updateMatrix();
      palmTrunks.setMatrixAt(i, dummy.matrix); palmLeaves.setMatrixAt(i, dummy.matrix);
      palmLeaves.setColorAt(i, col.set(pick(['#2f8a3a', '#3fa047', '#4c9a2a', '#2c7a36'])));
    });
    for (const m of [palmTrunks, palmLeaves]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    // Bụi cây thấp xen giữa
    const bushSpots = [];
    for (let k = 0; k < 260 * S2; k++) { const s = randomSpot(WALL_DIST + BANK_W + 2, 520 * S, onLand); if (s) bushSpots.push(s); }
    const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 0).translate(0, 0.6, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), bushSpots.length);
    bushSpots.forEach(([x, z], i) => {
      dummy.position.set(x, -0.35, z); dummy.rotation.set(0, Math.random() * 6, 0); dummy.scale.set(rand(0.8, 1.8), rand(0.6, 1.1), rand(0.8, 1.8)); dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix); bushes.setColorAt(i, col.set(pick(['#5a9a3a', '#6fae45', '#4b8a33'])));
    });
    bushes.castShadow = true; scene.add(bushes);

    // Hải đăng trên mỏm đá ngoài biển, có luồng sáng quay
    const lh = new THREE.Group();
    lh.position.set(maxX + 60, -0.3, shore - 70);
    scene.add(lh);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 1).scale(1.4, 0.45, 1.2), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 1, flatShading: true }));
    rock.castShadow = true; rock.receiveShadow = true; lh.add(rock);
    const redM = new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.5 }), whiteM = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
    for (let s = 0; s < 7; s++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.2 - (s + 1) * 0.22, 3.2 - s * 0.22, 4, 16), s % 2 ? whiteM : redM);
      seg.position.y = 5 + s * 4; seg.castShadow = true; lh.add(seg);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 12), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffe066, emissiveIntensity: 2 }));
    lamp.position.y = 34.2; lh.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.2, 12), redM); cap.position.y = 36.5; lh.add(cap);
    const beamPivot = new THREE.Group(); beamPivot.position.y = 34.2; lh.add(beamPivot);
    const beamMesh = new THREE.Mesh(new THREE.ConeGeometry(5, 80, 16, 1, true).translate(0, -40, 0).rotateZ(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beamPivot.add(beamMesh);
    updaters.push((dt) => { beamPivot.rotation.y += dt * 0.8; });

    // Thuyền buồm bập bềnh
    const hullGeo = new THREE.BoxGeometry(3, 1.2, 9).translate(0, 0.3, 0);
    const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 10); sailShape.lineTo(-4.5, 0.5); sailShape.closePath();
    const sailGeo = new THREE.ShapeGeometry(sailShape).rotateY(Math.PI / 2);
    for (let k = 0; k < 8; k++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: pick([0xffffff, 0x1d3557, 0xe63946]), roughness: 0.5 }));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 11, 6).translate(0, 6, 0), metal);
      const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: pick([0xffffff, 0xffd166, 0xef476f, 0x8ecae6]), side: THREE.DoubleSide, roughness: 0.8 }));
      sail.position.set(0, 1.2, 0.2);
      b.add(hull, mast, sail);
      hull.castShadow = true; sail.castShadow = true;
      const x0 = rand(minX - 300, maxX + 300), z0 = rand(shore - 420, shore - 90), sp = rand(1, 3), ph = Math.random() * 6;
      b.rotation.y = Math.PI / 2;
      scene.add(b);
      updaters.push((dt, t) => {
        b.position.set(x0 + ((t * sp) % 600) - 300, -0.4 + Math.sin(t * 1.2 + ph) * 0.25, z0);
        b.rotation.z = Math.sin(t * 0.9 + ph) * 0.06;
      });
    }
    // Đảo xa ngoài biển và đồi xanh phía đất liền
    mountains(7, 900 * S, 1300 * S, 60, 150, [0x3f6b48, 0x6f9a62, 0x8fb07a], [Math.PI * 1.15, Math.PI * 1.85], -20);
    mountains(12, 900 * S, 1250 * S, 140, 300, [0x48704f, 0x7f9f76, 0x9fbf8a], [Math.PI * 0.05, Math.PI * 0.95]);
    clouds(12, 0xffffff, 0x223344);
  }

  if (stage.theme === 'night') {
    // Sao và mặt trăng
    const starPos = [];
    for (let i = 0; i < 1600; i++) {
      const v = new THREE.Vector3().setFromSphericalCoords(2600, Math.acos(Math.random() * 0.95), Math.random() * Math.PI * 2);
      starPos.push(v.x + cx, v.y, v.z + cz);
    }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false }));
    moon.position.copy(sunDir).multiplyScalar(2400).add(new THREE.Vector3(cx, 0, cz));
    scene.add(moon);

    // Nhà cao tầng có cửa sổ sáng đèn (gộp thành 1 khối để vẽ nhanh)
    const winTex = makeWindows();
    const geos = [];
    const towerCols = ['#8a93a8', '#6f7891', '#9aa3b5', '#7d6f8f', '#5f7a8a', '#a39a8a'];
    for (let k = 0; k < 340 * S2; k++) {
      const s = randomSpot(WALL_DIST + BANK_W + 10, spread * 1.05);
      if (!s) continue;
      let near = Infinity;
      for (let i = 0; i < track.N; i += 10) near = Math.min(near, Math.hypot(s[0] - track.samples[i].x, s[1] - track.samples[i].z));
      const w = rand(12, 26), d = rand(12, 26), h = rand(18, 40) + Math.min(110, near * 0.35) * Math.random();
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv, ou = Math.floor(Math.random() * 16) / 16, ov = Math.floor(Math.random() * 16) / 16;
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        if (f === 2 || f === 3) { uv.setXY(i, 0.002, 0.002); continue; } // mái nhà: màu tường
        const fw = f < 2 ? d : w;
        uv.setXY(i, uv.getX(i) * (fw / 51.2) + ou, uv.getY(i) * (h / 57.6) + ov);
      }
      g.translate(s[0], h / 2 - 0.35, s[1]);
      const c = new THREE.Color(pick(towerCols)), cols = [];
      for (let i = 0; i < g.attributes.position.count; i++) cols.push(c.r, c.g, c.b);
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geos.push(g);
      blocked.push({ x: s[0], z: s[1], r: Math.max(w, d) * 0.75 });
    }
    const towers = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 1.1, vertexColors: true, roughness: 0.75 }));
    towers.castShadow = true; towers.receiveShadow = true; scene.add(towers);

    // Đèn đường hai bên và vũng sáng trên mặt đường
    const lampIdx = [];
    for (let i = 8, k = 0; i < track.N; i += 22, k++) lampIdx.push([i, k % 2 ? 1 : -1]);
    const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 9, 6).translate(0, 4.5, 0), metal, lampIdx.length);
    const armM = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 0.15, 0.2).translate(-1.6, 8.9, 0), metal, lampIdx.length);
    const headM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.25, 0.5).translate(-3.1, 8.75, 0), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), lampIdx.length);
    const pools = [];
    lampIdx.forEach(([i, side], k) => {
      const s = track.samples[i], n = track.normals[i], t = track.tangents[i];
      dummy.position.set(s.x + n.x * side * (WALL_DIST + 0.8), track.heights[i], s.z + n.z * side * (WALL_DIST + 0.8));
      dummy.rotation.set(0, Math.atan2(t.x, t.z) + (side < 0 ? Math.PI : 0), 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      poleM.setMatrixAt(k, dummy.matrix); armM.setMatrixAt(k, dummy.matrix); headM.setMatrixAt(k, dummy.matrix);
      pools.push(ribbon(track, side * (WALL_DIST - 1), side * -3, 0.12, 0.12, 1, { i0: i - 6, i1: i + 6, vFn: (q) => (q - (i - 6)) / 12 }));
    });
    poleM.castShadow = true;
    scene.add(poleM, armM, headM);
    const pool = new THREE.Mesh(mergeGeometries(pools), new THREE.MeshBasicMaterial({ map: makeGlow(), color: 0xffb870, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8 }));
    scene.add(pool);

    // Biển quảng cáo neon
    const ads = [['TỐC ĐỘ', '#ff3ea5'], ['PHỐ ĐÊM', '#2ef2ff'], ['VƯỢT LÊN!', '#ffe53b'], ['TĂNG TỐC', '#7cff6b'], ['VỀ ĐÍCH', '#ff7a2e'], ['ĐUA ĐÊM', '#b06bff'], ['CỐ LÊN!', '#2ef2ff'], ['TURBO', '#ff3ea5']];
    ads.forEach(([text, color], k) => {
      const i = 70 + k * 115, side = k % 2 ? 1 : -1;
      const f = frameAt(i % track.N, side);
      f.translateX(WALL_DIST + 7);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.4), new THREE.MeshBasicMaterial({ map: makeNeon(text, color), side: THREE.DoubleSide }));
      board.position.set(0, 9, 0); board.rotation.y = -Math.PI / 2; f.add(board);
      for (const z of [-5, 5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), metal); p.position.set(0.3, 3.5, z); f.add(p); }
    });
    mountains(14, 1100 * S, 1350 * S, 120, 260, [0x10142a, 0x1c2140, 0x2a3050]);
  }

  crowd.build(scene);

  return {
    sun, sunDir,
    update(dt, t, focus, excited) {
      for (const f of updaters) f(dt, t);
      crowd.update(dt, focus);
      flagman.update(dt, excited);
    },
  };
}
