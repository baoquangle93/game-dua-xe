// Đường đua: hình dạng, độ cao (đồi, gồ ghề, dốc nhảy), và các khối 3D
import * as THREE from 'three';
import { makeAsphalt, makeSand, makeStripes, makeGrass, makeConcrete } from './textures.js';

export const SAMPLES = 1000;   // số điểm chia dọc đường đua
export const ROAD_HALF = 8;    // nửa bề rộng mặt đường
export const CURB_W = 1.2;     // bề rộng bó vỉa đỏ trắng
export const WALL_DIST = 16;   // khoảng cách từ tim đường tới tường chắn
export const BANK_W = 16;      // bề rộng sườn đất từ tường xuống mặt cỏ

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (i, center, height, width) => height * Math.exp(-(((i - center) / width) ** 2));

// Độ cao mặt đường tại điểm i. Khu xuất phát (gần i = 0) giữ bằng phẳng.
function elevation(stage, i, N) {
  const s = i / N;
  const env = smooth(0.08, 0.16, s) * (1 - smooth(0.86, 0.93, s));
  let h = 0;
  for (const [amp, freq, phase] of stage.hills) h += amp * (0.5 - 0.5 * Math.cos(freq * Math.PI * s + phase));
  h *= env;
  for (const c of stage.rough) h += bump(i, c, 0.45, 2.2); // đoạn gồ ghề
  for (const [c, height] of stage.jumps) h += bump(i, c, height, 6); // dốc nhảy
  return h;
}

export function createTrack(stage) {
  const pts = stage.control.map(([x, z]) => new THREE.Vector3(x * 1.5, 0, z * 1.5));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const samples = curve.getSpacedPoints(SAMPLES);
  samples.pop(); // điểm cuối trùng điểm đầu
  const N = SAMPLES;
  const length = curve.getLength(), segLen = length / N;
  const tangents = [], normals = [], curvature = [], heights = [], slopes = [];
  for (let i = 0; i < N; i++) {
    const t = samples[(i + 1) % N].clone().sub(samples[(i - 1 + N) % N]).normalize();
    tangents.push(t);
    normals.push(new THREE.Vector3(t.z, 0, -t.x));
    heights.push(elevation(stage, i, N));
  }
  for (let i = 0; i < N; i++) {
    curvature.push(tangents[i].angleTo(tangents[(i + 15) % N]));
    slopes.push((heights[(i + 1) % N] - heights[(i - 1 + N) % N]) / (2 * segLen));
  }
  return { samples, tangents, normals, curvature, heights, slopes, length, segLen, N };
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

// Độ cao mặt đường tại một vị trí bất kỳ (gần điểm idx)
export function heightAt(track, idx, pos) {
  const { samples, tangents, heights, segLen, N } = track;
  const s = samples[idx], t = tangents[idx];
  const f = ((pos.x - s.x) * t.x + (pos.z - s.z) * t.z) / segLen;
  const j = f >= 0 ? (idx + 1) % N : (idx - 1 + N) % N;
  return heights[idx] + (heights[j] - heights[idx]) * Math.min(1, Math.abs(f));
}

export function heightAtT(track, t) {
  const N = track.N, k = Math.floor(t), f = t - k;
  const a = ((k % N) + N) % N, b = (a + 1) % N;
  return track.heights[a] + (track.heights[b] - track.heights[a]) * f;
}

// Tạo một dải chạy dọc theo đường (bám theo độ cao), từ độ lệch ngang offA tới offB.
// opt.i0/i1: chỉ dựng một đoạn; opt.groundB: mép B nằm ở độ cao cố định yB; opt.vFn: toạ độ v tuỳ chỉnh
export function ribbon(track, offA, offB, yA, yB, vScale, opt = {}) {
  const { samples, normals, heights, N, segLen } = track;
  const i0 = opt.i0 ?? 0, i1 = opt.i1 ?? N;
  const pos = [], uv = [], idx = [];
  for (let i = i0; i <= i1; i++) {
    const k = ((i % N) + N) % N, p = samples[k], n = normals[k], h = heights[k];
    const v = opt.vFn ? opt.vFn(i) : (i * segLen) / vScale;
    pos.push(p.x + n.x * offA, h + yA, p.z + n.z * offA, p.x + n.x * offB, opt.groundB ? yB : h + yB, p.z + n.z * offB);
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < i1 - i0; i++) {
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

// Màu tường chắn và chất liệu lề đường theo từng kiểu cảnh
const LOOK = {
  sunset: { wall: ['#e63946', '#f1faee'], verge: () => makeSand(), bank: () => makeGrass() },
  beach: { wall: ['#1d8fe1', '#f1faee'], verge: () => makeSand('#e6cf9c'), bank: () => makeSand('#dcc28a') },
  night: { wall: ['#f4c430', '#1b1b1f'], verge: () => makeConcrete('#5d6069'), bank: () => makeConcrete('#3d4048') },
};

export function buildTrackMeshes(scene, track, theme) {
  const look = LOOK[theme];
  const add = (geo, mat, cast = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true; m.castShadow = cast;
    scene.add(m);
  };
  add(ribbon(track, -ROAD_HALF, ROAD_HALF, 0.03, 0.03, 16),
    new THREE.MeshStandardMaterial({ map: makeAsphalt(), roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));

  const curbMat = new THREE.MeshStandardMaterial({ map: makeStripes('#d62839', '#f4f4f4'), roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
  const sandMat = new THREE.MeshStandardMaterial({ map: look.verge(), roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  const wallMat = new THREE.MeshStandardMaterial({ map: makeStripes(...look.wall), roughness: 0.5, side: THREE.DoubleSide });
  const bankMat = new THREE.MeshStandardMaterial({ map: look.bank(), roughness: 1, side: THREE.DoubleSide });

  for (const s of [-1, 1]) {
    add(ribbon(track, s * ROAD_HALF, s * (ROAD_HALF + CURB_W), 0.05, 0.05, 3), curbMat);
    add(ribbon(track, s * (ROAD_HALF + CURB_W), s * WALL_DIST, 0, 0, 8), sandMat);
    add(ribbon(track, s * WALL_DIST, s * WALL_DIST, 0, 1.1, 4), wallMat, true);
    // Sườn đất cỏ từ chân tường xuống mặt đất (để đoạn đường trên đồi không bị "lơ lửng")
    add(ribbon(track, s * WALL_DIST, s * (WALL_DIST + BANK_W), 0, -0.3, 13, { groundB: true }), bankMat);
  }
}
