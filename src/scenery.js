// Bầu trời hoàng hôn, ánh sáng, cỏ, cây, núi, mây, khán đài, cổng xuất phát
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeGrass, makeChecker, makeBanner } from './textures.js';
import { ROAD_HALF, WALL_DIST, BANK_W } from './track.js';

const rand = (a, b) => a + Math.random() * (b - a);

export function buildWorld(scene, renderer, track) {
  // ---------- Bầu trời + ánh sáng ----------
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(85), THREE.MathUtils.degToRad(200));
  const setupSky = (sky) => {
    sky.scale.setScalar(10000);
    const u = sky.material.uniforms;
    u.turbidity.value = 9; u.rayleigh.value = 3.2;
    u.mieCoefficient.value = 0.008; u.mieDirectionalG.value = 0.9;
    u.sunPosition.value.copy(sunDir);
    return sky;
  };
  scene.add(setupSky(new Sky()));

  // Ánh phản chiếu của bầu trời lên thân xe bóng loáng
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(setupSky(new Sky()));
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.environmentIntensity = 0.8;

  scene.fog = new THREE.Fog(0xe0a07a, 320, 1900);
  scene.add(new THREE.HemisphereLight(0xffd2b0, 0x4a6b3a, 0.6));

  const sun = new THREE.DirectionalLight(0xffb27a, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 420 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---------- Mặt đất cỏ ----------
  const grassTex = makeGrass();
  grassTex.repeat.set(380, 380);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- Cây (dùng instancing để vẽ hàng trăm cây vẫn mượt) ----------
  const far2 = (WALL_DIST + BANK_W + 3) ** 2;
  const nearTrack = (x, z) => {
    for (let i = 0; i < track.N; i += 4) {
      const s = track.samples[i], dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < far2) return true;
    }
    return false;
  };
  const spots = [];
  while (spots.length < 520) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 560;
    const x = 40 + Math.cos(a) * r, z = 110 + Math.sin(a) * r;
    if (!nearTrack(x, z)) spots.push([x, z]);
  }
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(2.7, 6, 7).translate(0, 5.5, 0),
    new THREE.ConeGeometry(2.0, 4.6, 7).translate(0, 8.4, 0),
  ]);
  const roundGeo = new THREE.IcosahedronGeometry(3.1, 0).translate(0, 5.6, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.5, 3.4, 6).translate(0, 1.7, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 1 });
  const nPine = 300, nRound = spots.length - nPine;
  const pines = new THREE.InstancedMesh(pineGeo, leafMat, nPine);
  const rounds = new THREE.InstancedMesh(roundGeo, leafMat, nRound);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const greens = ['#2f6b2a', '#3d7f33', '#4f8f3a', '#6a9b3f', '#3f6e2c'];
  const autumn = ['#c46a2b', '#d9a03a', '#b5462d'];
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach(([x, z], i) => {
    dummy.position.set(x, -0.3, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.setScalar(rand(0.75, 1.6));
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    col.set(Math.random() < 0.15 ? autumn[(Math.random() * 3) | 0] : greens[(Math.random() * 5) | 0]);
    if (i < nPine) { pines.setMatrixAt(i, dummy.matrix); pines.setColorAt(i, col); }
    else { rounds.setMatrixAt(i - nPine, dummy.matrix); rounds.setColorAt(i - nPine, col); }
  });
  for (const m of [pines, rounds, trunks]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // ---------- Núi xa và mây ----------
  // Núi: hình nón được "bóp méo" ngẫu nhiên cho tự nhiên, màu chuyển từ chân lên đỉnh, đỉnh cao có tuyết
  const mountainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const low = new THREE.Color(0x4a4470), mid = new THREE.Color(0x8a6a9a), snow = new THREE.Color(0xfbeef0);
  const makeMountain = (radius, h) => {
    const g = new THREE.ConeGeometry(radius, h, 11, 6);
    const p = g.attributes.position, cols = [];
    const seed = Math.random() * 100;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (y + h / 2) / h; // 0 ở chân, 1 ở đỉnh
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
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + rand(-0.1, 0.1), r = rand(880, 1200);
    const h = rand(150, 340);
    const m = new THREE.Mesh(makeMountain(rand(160, 280), h), mountainMat);
    m.position.set(40 + Math.cos(a) * r, h / 2 - 5, 110 + Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    scene.add(m);
  }
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfff1e6, roughness: 1, flatShading: true, emissive: 0x553322, emissiveIntensity: 0.25 });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Mesh(puff, cloudMat);
      p.position.set(rand(-40, 40), rand(-6, 8), rand(-15, 15));
      p.scale.setScalar(rand(14, 26));
      g.add(p);
    }
    const a = Math.random() * Math.PI * 2, r = rand(300, 1000);
    g.position.set(40 + Math.cos(a) * r, rand(220, 330), 110 + Math.sin(a) * r);
    scene.add(g);
  }

  // ---------- Cổng xuất phát + vạch đích ----------
  const frameAt = (i, side = 1) => {
    const g = new THREE.Group();
    const t = track.tangents[i], p = track.samples[i];
    g.position.set(p.x, track.heights[i], p.z);
    g.rotation.y = Math.atan2(t.x, t.z) + (side < 0 ? Math.PI : 0); // trục x của nhóm = phương ngang đường
    scene.add(g);
    return g;
  };
  const gate = frameAt(0);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d42, metalness: 0.7, roughness: 0.35 });
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.4), new THREE.MeshStandardMaterial({ map: makeChecker(16, 2), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4 }));
  startLine.rotation.x = -Math.PI / 2; startLine.position.y = 0.06; startLine.receiveShadow = true;
  gate.add(startLine);
  for (const x of [-(ROAD_HALF + 2.5), ROAD_HALF + 2.5]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), metal);
    pillar.position.set(x, 4.5, 0); pillar.castShadow = true; gate.add(pillar);
  }
  const bannerTex = makeBanner('ĐƯỜNG ĐUA HOÀNG HÔN');
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.35, roughness: 0.6 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 6, 2, 0.8), [metal, metal, metal, metal, bannerMat, bannerMat]);
  beam.position.y = 9; beam.castShadow = true; gate.add(beam);

  // ---------- Khán đài có khán giả ----------
  const stand = frameAt(45, -1);
  stand.translateX(WALL_DIST + 3);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x8d99ae, roughness: 0.8 });
  for (let j = 0; j < 6; j++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8 * (j + 1), 34), standMat);
    step.position.set(j * 2, 0.4 * (j + 1), 0); step.castShadow = true; step.receiveShadow = true; stand.add(step);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 36), new THREE.MeshStandardMaterial({ color: 0xef476f, roughness: 0.5 }));
  roof.position.set(5, 8.5, 0); roof.castShadow = true; stand.add(roof);
  for (const z of [-17, 17]) for (const x of [-1, 11]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8.5, 0.4), metal);
    post.position.set(x, 4.25, z); stand.add(post);
  }
  const crowdCols = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff', '#f78c6b', '#9b5de5'];
  const people = [];
  for (let j = 0; j < 6; j++) for (let z = -16; z <= 16; z += 0.9) if (Math.random() < 0.8) people.push([j * 2, 0.8 * (j + 1), z]);
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.9, 0.55), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), people.length);
  people.forEach(([x, y, z], i) => {
    dummy.position.set(x + rand(-0.3, 0.3), y + 0.45, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, rand(0.85, 1.15), 1); dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix); crowd.setColorAt(i, col.set(crowdCols[(Math.random() * crowdCols.length) | 0]));
  });
  crowd.castShadow = true; stand.add(crowd);

  // ---------- Cờ dọc đường đua (tạo cảm giác tốc độ) ----------
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 6).translate(0, 2.5, 0);
  const flagGeo = new THREE.BoxGeometry(0.05, 1, 1.5).translate(0, 4.4, 0.78);
  const flagCols = [0xffd166, 0x06d6a0, 0x118ab2, 0xef476f];
  for (let i = 10, k = 0; i < track.N; i += 50, k++) {
    const f = frameAt(i);
    f.translateX((k % 2 ? 1 : -1) * (WALL_DIST + 1.5));
    f.add(new THREE.Mesh(poleGeo, metal));
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: flagCols[k % 4], roughness: 0.6, side: THREE.DoubleSide }));
    flag.castShadow = true; f.add(flag);
  }

  return { sun, sunDir };
}
