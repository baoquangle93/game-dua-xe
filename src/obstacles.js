// Chướng ngại vật trên đường: thùng phuy, cọc tiêu, vũng dầu, và ô tăng tốc
import * as THREE from 'three';
import { makeBoost } from './textures.js';

// Vị trí đặt: i = điểm dọc đường (0..999, vạch xuất phát ở 0), lat = lệch ngang so với tim đường
// (mặt đường rộng từ -8 tới 8). Tránh khu vực xuất phát.
const PLAN = [
  { i: 90, type: 'cones', lat: -3.5 },
  { i: 150, type: 'boost', lat: 3 },
  { i: 215, type: 'barrels', lat: 4.3 },
  { i: 275, type: 'oil', lat: -3 },
  { i: 340, type: 'cones', lat: 3.5 },
  { i: 400, type: 'barrels', lat: -4.3 },
  { i: 455, type: 'boost', lat: -3 },
  { i: 520, type: 'oil', lat: 3.5 },
  { i: 585, type: 'barrels', lat: 0 },
  { i: 650, type: 'cones', lat: -3.5 },
  { i: 715, type: 'boost', lat: 0 },
  { i: 775, type: 'oil', lat: -4 },
  { i: 840, type: 'barrels', lat: 4 },
  { i: 900, type: 'cones', lat: 3 },
];

const barrelBody = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 18).translate(0, 0.75, 0);
const barrelRing = new THREE.CylinderGeometry(0.78, 0.78, 0.08, 18);
const coneBody = new THREE.ConeGeometry(0.3, 0.85, 14).translate(0, 0.5, 0);
const coneBand = new THREE.CylinderGeometry(0.19, 0.24, 0.14, 14).translate(0, 0.52, 0);
const coneBase = new THREE.BoxGeometry(0.66, 0.07, 0.66).translate(0, 0.035, 0);

export function createObstacles(scene, track) {
  const { samples, normals, tangents, segLen, N } = track;
  const items = []; // mỗi vật: { type, pos, r, ... }
  const zones = []; // vùng xe máy cần lách: { i0, i1, lat0, lat1 }
  const perUnit = 1 / segLen; // số điểm dọc đường ứng với 1 đơn vị chiều dài

  const at = (idx, lat) => {
    const k = ((Math.round(idx) % N) + N) % N;
    const p = samples[k], n = normals[k];
    return { pos: new THREE.Vector3(p.x + n.x * lat, 0, p.z + n.z * lat), yaw: Math.atan2(tangents[k].x, tangents[k].z) };
  };
  const shadowed = (m) => { m.traverse((o) => { o.castShadow = true; o.receiveShadow = true; }); return m; };

  const ringMat = new THREE.MeshStandardMaterial({ color: 0x22252b, metalness: 0.6, roughness: 0.4 });
  const barrelMats = [0xc1121f, 0x1d4e89, 0xf4a300].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.35 }));
  const orange = new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const oilMat = new THREE.MeshStandardMaterial({ color: 0x07070c, metalness: 0.4, roughness: 0.06, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -6 });
  const boostTex = makeBoost();
  boostTex.repeat.set(1, 2);
  const boostMat = new THREE.MeshStandardMaterial({ map: boostTex, emissive: 0xffffff, emissiveMap: boostTex, emissiveIntensity: 0.8, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -6 });

  PLAN.forEach((o, gi) => {
    if (o.type === 'barrels') {
      // 3 thùng xếp hình tam giác
      for (const [ahead, side] of [[0, -0.95], [0, 0.95], [2.2, 0]]) {
        const a = at(o.i + ahead * perUnit, o.lat + side);
        const m = new THREE.Group();
        m.add(new THREE.Mesh(barrelBody, barrelMats[gi % 3]));
        for (const y of [0.45, 1.05]) { const ring = new THREE.Mesh(barrelRing, ringMat); ring.position.y = y; m.add(ring); }
        m.position.copy(a.pos);
        scene.add(shadowed(m));
        items.push({ type: 'barrel', pos: a.pos, r: 0.75 });
      }
      zones.push({ i0: o.i - 4, i1: o.i + 3 * perUnit + 5, lat0: o.lat - 1.8, lat1: o.lat + 1.8 });
    } else if (o.type === 'cones') {
      // Hàng 5 cọc tiêu xếp chéo
      for (let c = 0; c < 5; c++) {
        const a = at(o.i + c * 3.5 * perUnit, o.lat - 1.6 + c * 0.8);
        const m = new THREE.Group();
        m.add(new THREE.Mesh(coneBody, orange), new THREE.Mesh(coneBand, white), new THREE.Mesh(coneBase, orange));
        m.position.copy(a.pos);
        scene.add(shadowed(m));
        items.push({ type: 'cone', pos: a.pos.clone(), home: a.pos.clone(), r: 0.35, mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), knocked: false, rest: false });
      }
      zones.push({ i0: o.i - 4, i1: o.i + 15 * perUnit + 5, lat0: o.lat - 2.2, lat1: o.lat + 2.2 });
    } else if (o.type === 'oil') {
      const a = at(o.i, o.lat);
      const m = new THREE.Mesh(new THREE.CircleGeometry(2.3, 28), oilMat);
      m.rotation.set(-Math.PI / 2, 0, a.yaw);
      m.scale.set(1, 1.35, 1);
      m.position.set(a.pos.x, 0.08, a.pos.z);
      m.receiveShadow = true;
      scene.add(m);
      items.push({ type: 'oil', pos: a.pos, r: 2.5 });
      zones.push({ i0: o.i - 3 * perUnit, i1: o.i + 3 * perUnit, lat0: o.lat - 2.5, lat1: o.lat + 2.5 });
    } else if (o.type === 'boost') {
      const a = at(o.i, o.lat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6), boostMat);
      m.rotation.set(-Math.PI / 2, 0, a.yaw);
      m.position.set(a.pos.x, 0.08, a.pos.z);
      scene.add(m);
      items.push({ type: 'boost', pos: a.pos, r: 2.4 });
    }
  });

  // Tông đổ một cọc tiêu: cọc văng lên, xoay rồi nằm xuống đường
  function knock(o, carVel, awayX, awayZ) {
    o.knocked = true; o.rest = false;
    const sp = carVel.length();
    o.vel.set(carVel.x * 0.8 + awayX * 3, 4 + sp * 0.08, carVel.z * 0.8 + awayZ * 3);
    o.spin.set(Math.random() * 10 - 5, Math.random() * 6 - 3, Math.random() * 10 - 5);
  }

  function update(dt) {
    boostTex.offset.y = (boostTex.offset.y + dt * 1.6) % 1;
    for (const o of items) {
      if (o.type !== 'cone' || !o.knocked || o.rest) continue;
      o.vel.y -= 22 * dt;
      o.pos.addScaledVector(o.vel, dt);
      o.mesh.rotation.x += o.spin.x * dt;
      o.mesh.rotation.y += o.spin.y * dt;
      o.mesh.rotation.z += o.spin.z * dt;
      if (o.pos.y <= 0) {
        o.pos.y = 0;
        o.vel.set(o.vel.x * 0.55, -o.vel.y * 0.3, o.vel.z * 0.55);
        o.spin.multiplyScalar(0.6);
        if (o.vel.length() < 0.6) { o.rest = true; o.mesh.rotation.set(0, o.mesh.rotation.y, Math.PI / 2); o.pos.y = 0.3; }
      }
      o.mesh.position.copy(o.pos);
    }
  }

  function reset() {
    for (const o of items) {
      if (o.type !== 'cone') continue;
      o.knocked = false; o.rest = false;
      o.pos.copy(o.home); o.vel.set(0, 0, 0);
      o.mesh.position.copy(o.home); o.mesh.rotation.set(0, 0, 0);
    }
  }

  return { items, zones, knock, update, reset };
}
