// Đường đua: hình dạng, dữ liệu để tính vị trí xe, và các khối 3D (mặt đường, bó vỉa, tường)
import * as THREE from 'three';
import { makeAsphalt, makeSand, makeStripes } from './textures.js';

export const SAMPLES = 1000;   // số điểm chia dọc đường đua
export const ROAD_HALF = 8;    // nửa bề rộng mặt đường
export const CURB_W = 1.2;     // bề rộng bó vỉa đỏ trắng
export const WALL_DIST = 16;   // khoảng cách từ tim đường tới tường chắn

// Các điểm điều khiển (x, z) của đường đua khép kín:
// dạng bầu dục với 2 đoạn thẳng dài, chỉ vài khúc cua thoải
const CONTROL = [
  [-60, 0], [200, 0], [290, 50], [300, 170], [230, 250],
  [60, 260], [-100, 240], [-170, 160], [-160, 50],
];

export function createTrack() {
  const pts = CONTROL.map(([x, z]) => new THREE.Vector3(x * 1.5, 0, z * 1.5));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const samples = curve.getSpacedPoints(SAMPLES);
  samples.pop(); // điểm cuối trùng điểm đầu
  const N = SAMPLES;
  const tangents = [], normals = [], curvature = [];
  for (let i = 0; i < N; i++) {
    const t = samples[(i + 1) % N].clone().sub(samples[(i - 1 + N) % N]).normalize();
    tangents.push(t);
    normals.push(new THREE.Vector3(t.z, 0, -t.x));
  }
  for (let i = 0; i < N; i++) curvature.push(tangents[i].angleTo(tangents[(i + 15) % N]));
  const length = curve.getLength();
  return { samples, tangents, normals, curvature, length, segLen: length / N, N };
}

// Tìm điểm trên tim đường gần vị trí nhất, và độ lệch ngang so với tim đường
export function nearest(track, pos, hint) {
  const { samples, N } = track;
  let best = 0, bestD = Infinity;
  const check = (i) => {
    const s = samples[i];
    const dx = pos.x - s.x, dz = pos.z - s.z, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  };
  if (hint == null || hint < 0) for (let i = 0; i < N; i++) check(i);
  else for (let o = -40; o <= 40; o++) check(((hint + o) % N + N) % N);
  const s = samples[best], n = track.normals[best];
  return { idx: best, lateral: (pos.x - s.x) * n.x + (pos.z - s.z) * n.z };
}

// Lấy vị trí trên tim đường tại chỉ số thực t (có nội suy)
export function sampleAt(track, t, out) {
  const N = track.N, k = Math.floor(t), f = t - k;
  const a = ((k % N) + N) % N, b = (a + 1) % N;
  out.lerpVectors(track.samples[a], track.samples[b], f);
  return a;
}

// Tạo một dải chạy dọc theo đường, từ độ lệch offA tới offB
function ribbon(track, offA, offB, yA, yB, vScale) {
  const { samples, normals, N, segLen } = track;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N, p = samples[k], n = normals[k], v = (i * segLen) / vScale;
    pos.push(p.x + n.x * offA, yA, p.z + n.z * offA, p.x + n.x * offB, yB, p.z + n.z * offB);
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildTrackMeshes(scene, track) {
  const road = new THREE.Mesh(
    ribbon(track, -ROAD_HALF, ROAD_HALF, 0.03, 0.03, 16),
    new THREE.MeshStandardMaterial({ map: makeAsphalt(), roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  road.receiveShadow = true;
  scene.add(road);

  const curbMat = new THREE.MeshStandardMaterial({ map: makeStripes('#d62839', '#f4f4f4'), roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
  for (const [a, b] of [[-ROAD_HALF - CURB_W, -ROAD_HALF], [ROAD_HALF, ROAD_HALF + CURB_W]]) {
    const m = new THREE.Mesh(ribbon(track, a, b, 0.05, 0.05, 3), curbMat);
    m.receiveShadow = true; scene.add(m);
  }

  const sandMat = new THREE.MeshStandardMaterial({ map: makeSand(), roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const [a, b] of [[-WALL_DIST, -ROAD_HALF - CURB_W], [ROAD_HALF + CURB_W, WALL_DIST]]) {
    const m = new THREE.Mesh(ribbon(track, a, b, 0, 0, 8), sandMat);
    m.receiveShadow = true; scene.add(m);
  }

  const wallMat = new THREE.MeshStandardMaterial({ map: makeStripes('#e63946', '#f1faee'), roughness: 0.5, side: THREE.DoubleSide });
  for (const off of [-WALL_DIST, WALL_DIST]) {
    const m = new THREE.Mesh(ribbon(track, off, off, 0, 1.1, 4), wallMat);
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
}
