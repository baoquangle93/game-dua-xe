// ĐƯỜNG ĐUA HOÀNG HÔN - game đua xe 3D (Three.js)
import * as THREE from 'three';
import './style.css';
import { createTrack, buildTrackMeshes, nearest, sampleAt, ROAD_HALF, CURB_W, WALL_DIST } from './track.js';
import { buildWorld } from './scenery.js';
import { createCar } from './car.js';
import { input, setupInput } from './input.js';
import { Smoke, EngineSound } from './effects.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const LAPS = 3;          // số vòng đua
const MAX_SPEED = 62;    // tốc độ tối đa (đơn vị game / giây)
const KMH = 3.4;         // hệ số đổi ra km/h để hiển thị
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;

// ---------- Khởi tạo đồ hoạ ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 6000);

const track = createTrack();
buildTrackMeshes(scene, track);
const world = buildWorld(scene, renderer, track);
const smoke = new Smoke(scene);
const engine = new EngineSound();
setupInput();
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('co-cham');

// Hiệu ứng phát sáng (mặt trời, đèn xe). Tắt trên điện thoại cho nhẹ máy.
let composer = null;
if (!isTouch) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.5, 0.88));
  composer.addPass(new OutputPass());
}
const render = () => (composer ? composer.render() : renderer.render(scene, camera));

// ---------- Xe đua ----------
function makeRacer(color, extra = {}) {
  const car = createCar(color);
  scene.add(car.group);
  return {
    car, color: '#' + color.toString(16).padStart(6, '0'),
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, steer: 0, spin: 0,
    idx: 0, progress: 0, finishTime: null, fs: 0, slip: 0, wrong: 0, ...extra,
  };
}
const player = makeRacer(0xe63946);
const ais = [
  makeRacer(0x1d8fe1, { base: 55.5, laneSpeed: 0.35 }),
  makeRacer(0xf4c430, { base: 57.5, laneSpeed: 0.27 }),
  makeRacer(0x2ec4b6, { base: 59.5, laneSpeed: 0.31 }),
];
const racers = [player, ...ais];
// Vị trí xuất phát: [lùi sau vạch bao nhiêu điểm, lệch ngang]
const GRID = [[30, -3.5], [12, 3.5], [12, -3.5], [30, 3.5]];

function placeOnGrid() {
  const N = track.N;
  racers.forEach((r, i) => {
    const idx = N - GRID[i][0], lat = GRID[i][1];
    const p = track.samples[idx], n = track.normals[idx], t = track.tangents[idx];
    r.pos.set(p.x + n.x * lat, 0, p.z + n.z * lat);
    r.heading = Math.atan2(t.x, t.z);
    r.vel.set(0, 0, 0);
    Object.assign(r, { steer: 0, idx, t: idx, progress: idx - N, speed: 0, lane: lat, lane0: lat, laneT: Math.random() * 6, push: 0, finishTime: null, fs: 0, slip: 0, wrong: 0 });
    applyVisuals(r, 0, false, false);
  });
}

// ---------- Trạng thái game ----------
let state = 'menu';         // menu | countdown | race | done
let countdown = 0, raceTime = 0, goTimer = 0, menuT = 0, shake = 0, raceId = 0;
let muted = false, finishShown = false;
let best = null;
try { best = Number(localStorage.getItem('dua-xe-ky-luc')) || null; } catch (e) { /* trình duyệt chặn lưu */ }

const fmt = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
function showBest() { $('ky-luc-menu').textContent = best ? 'Kỷ lục của bạn: ' + fmt(best) : ''; }

function startRace() {
  raceId++;
  placeOnGrid();
  smoke.clear();
  state = 'countdown'; countdown = 3; raceTime = 0; goTimer = 0; finishShown = false;
  $('menu').classList.add('an-di');
  $('ket-qua').classList.add('an-di');
  $('hud').classList.remove('an-di');
  engine.start();
  snapCamera();
}
function toMenu() {
  raceId++;
  state = 'menu';
  placeOnGrid();
  $('menu').classList.remove('an-di');
  $('ket-qua').classList.add('an-di');
  $('hud').classList.add('an-di');
  $('dem-nguoc').textContent = '';
  showBest();
}
function toggleMute() { muted = !muted; $('nut-am').textContent = muted ? '🔇' : '🔊'; }

$('nut-bat-dau').addEventListener('click', startRace);
$('nut-dua-lai').addEventListener('click', startRace);
$('nut-menu').addEventListener('click', toMenu);
$('nut-am').addEventListener('click', toggleMute);
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && (state === 'menu' || finishShown)) startRace();
  if (e.code === 'KeyM') toggleMute();
});

function playerRank() {
  let rank = 1;
  for (const a of ais) {
    if (player.finishTime != null) { if (a.finishTime != null && a.finishTime < player.finishTime) rank++; }
    else if (a.finishTime != null || a.progress > player.progress) rank++;
  }
  return rank;
}

function showResults(id) {
  if (id !== raceId) return;
  finishShown = true;
  const rank = playerRank(), t = player.finishTime;
  const newBest = best == null || t < best;
  if (newBest) { best = t; try { localStorage.setItem('dua-xe-ky-luc', String(t)); } catch (e) { /* bỏ qua */ } }
  $('kq-tieu-de').textContent = rank === 1 ? '🏆 CHIẾN THẮNG!' : 'VỀ ĐÍCH!';
  $('kq-hang').textContent = `Hạng ${rank}/4`;
  $('kq-thoi-gian').textContent = 'Thời gian: ' + fmt(t) + (newBest ? ' — kỷ lục mới!' : '');
  $('kq-ky-luc').textContent = 'Kỷ lục: ' + fmt(best);
  $('ket-qua').classList.remove('an-di');
}

// ---------- Hiển thị xe (bánh quay, thân nghiêng, đèn phanh) ----------
function applyVisuals(r, dt, thr, brk) {
  const c = r.car;
  c.group.position.copy(r.pos);
  c.group.rotation.y = r.heading;
  r.spin += (r.fs * dt) / 0.42;
  for (const w of c.wheels) {
    w.spin.rotation.x = r.spin;
    if (w.front) w.pivot.rotation.y = r.steer * 0.5;
  }
  const ratio = Math.min(1, Math.abs(r.fs) / MAX_SPEED);
  const k = Math.min(1, dt * 6);
  c.chassis.rotation.z += (r.steer * ratio * 0.06 - c.chassis.rotation.z) * k;
  c.chassis.rotation.x += ((brk ? 0.025 : 0) - (thr ? 0.015 : 0) - c.chassis.rotation.x) * k;
  c.tailMat.emissiveIntensity = brk ? 4 : 1.2;
}

const wheelPos = new THREE.Vector3();
function emitSmoke(r, color) {
  for (const x of [0.95, -0.95]) {
    if (Math.random() < 0.55) {
      wheelPos.set(x, 0.25, -1.35);
      r.car.group.localToWorld(wheelPos);
      smoke.spawn(wheelPos, color);
    }
  }
}

// ---------- Vật lý xe người chơi ----------
const fwd = new THREE.Vector3(), lat = new THREE.Vector3(), diff = new THREE.Vector3();
function updatePlayer(dt) {
  const r = player;
  if (state === 'menu' || state === 'countdown') {
    r.vel.set(0, 0, 0); r.fs = 0;
    applyVisuals(r, dt, state === 'countdown' && input.up, false);
    return;
  }
  const drive = state === 'race' && r.finishTime == null;
  const near = nearest(track, r.pos, r.idx);
  const offroad = Math.abs(near.lateral) > ROAD_HALF + CURB_W;
  const thr = drive && input.up, brk = drive && input.down, hb = drive && input.handbrake;

  fwd.set(Math.sin(r.heading), 0, Math.cos(r.heading));
  let fs = r.vel.dot(fwd);
  if (thr) r.vel.addScaledVector(fwd, 30 * (1 - Math.max(0, fs) / (MAX_SPEED * 1.05)) * dt);
  if (brk) {
    if (fs > 1) r.vel.addScaledVector(fwd, -45 * dt);
    else if (fs > -16) r.vel.addScaledVector(fwd, -14 * dt);
  }

  // Đánh lái: càng nhanh càng khó bẻ lái gắt
  const target = drive ? (input.left ? 1 : 0) - (input.right ? 1 : 0) : 0;
  r.steer += (target - r.steer) * Math.min(1, dt * 7);
  fs = r.vel.dot(fwd);
  const steerPower = Math.min(1, Math.abs(fs) / 10) * (1 - 0.45 * Math.min(1, Math.abs(fs) / MAX_SPEED));
  r.heading += r.steer * 1.9 * steerPower * Math.sign(fs) * (hb ? 1.4 : 1) * dt;
  fwd.set(Math.sin(r.heading), 0, Math.cos(r.heading));

  // Độ bám đường: phần vận tốc trượt ngang bị triệt dần (phanh tay => trượt nhiều => drift)
  fs = r.vel.dot(fwd);
  lat.copy(r.vel).addScaledVector(fwd, -fs);
  r.slip = lat.length();
  const grip = hb ? 1.6 : offroad ? 3.5 : 7;
  r.vel.addScaledVector(lat, -Math.min(1, grip * dt));

  const drag = (offroad ? 1.3 : 0.18) + (thr ? 0 : 0.35) + (hb ? 0.5 : 0);
  r.vel.multiplyScalar(Math.max(0, 1 - drag * dt));
  const maxS = offroad ? 30 : MAX_SPEED;
  const sp = r.vel.length();
  if (sp > maxS) r.vel.setLength(sp + (maxS - sp) * Math.min(1, 3 * dt));
  if (r.finishTime != null) r.vel.multiplyScalar(1 - Math.min(1, 1.2 * dt)); // về đích thì tự giảm tốc

  r.pos.addScaledVector(r.vel, dt);

  // Va tường chắn
  const n2 = nearest(track, r.pos, near.idx);
  const nrm = track.normals[n2.idx];
  const lim = WALL_DIST - 1.3;
  if (Math.abs(n2.lateral) > lim) {
    const s = Math.sign(n2.lateral);
    r.pos.addScaledVector(nrm, -(n2.lateral - s * lim));
    const vn = r.vel.dot(nrm);
    if (vn * s > 0) {
      r.vel.addScaledVector(nrm, -vn * 1.4);
      r.vel.multiplyScalar(0.75);
      shake = Math.min(0.7, shake + Math.abs(vn) * 0.03);
    }
  }

  // Va chạm với xe đối thủ
  for (const a of ais) {
    diff.subVectors(r.pos, a.pos); diff.y = 0;
    const d = diff.length();
    if (d < 3.4 && d > 0.001) {
      diff.multiplyScalar((3.4 - d) / d);
      r.pos.addScaledVector(diff, 0.7);
      const side = (a.pos.x - r.pos.x) * track.normals[n2.idx].x + (a.pos.z - r.pos.z) * track.normals[n2.idx].z;
      a.push += Math.sign(side || 1) * 1.2;
      r.vel.multiplyScalar(0.95);
      a.speed *= 0.97;
      shake = Math.min(0.5, shake + 0.08);
    }
  }

  // Tiến độ vòng đua (cộng dồn để chạy ngược không gian lận được)
  let d = n2.idx - r.idx;
  if (d > track.N / 2) d -= track.N;
  if (d < -track.N / 2) d += track.N;
  r.progress += d;
  r.idx = n2.idx;
  r.wrong = r.vel.dot(track.tangents[r.idx]) < -4 ? r.wrong + dt : 0;

  if (r.finishTime == null && r.progress >= LAPS * track.N) {
    r.finishTime = raceTime;
    state = 'done';
    const id = raceId;
    setTimeout(() => showResults(id), 1500);
  }

  r.fs = r.vel.dot(fwd);
  applyVisuals(r, dt, thr, brk);
  if (r.slip > 5 && Math.abs(r.fs) > 8) emitSmoke(r, '#e6e6e6');
  else if (offroad && Math.abs(r.fs) > 10) emitSmoke(r, '#b48c5c');
}

// ---------- Xe đối thủ (máy điều khiển) ----------
const aiPoint = new THREE.Vector3();
function updateAI(a, dt) {
  if (state === 'menu' || state === 'countdown') { a.fs = 0; applyVisuals(a, dt, false, false); return; }
  const N = track.N;
  const k = ((Math.floor(a.t) + 12) % N + N) % N;
  const curv = Math.max(track.curvature[k], track.curvature[(k + 12) % N]);
  let target = a.base * (1 - Math.min(0.5, curv * 0.9)); // giảm tốc trước khúc cua
  if (player.finishTime == null) {
    const gap = a.progress - player.progress;
    if (gap > 120) target *= 0.9;          // chờ người chơi một chút cho hấp dẫn
    else if (gap < -150) target *= 1.08;
  }
  if (a.finishTime != null) target *= 0.5;
  const brk = target < a.speed - 3;
  a.speed += clamp(target - a.speed, -28 * dt, 14 * dt);
  const adv = (a.speed * dt) / track.segLen;
  a.t += adv;
  a.progress += adv;

  a.laneT += dt * a.laneSpeed;
  a.push *= 1 - Math.min(1, dt * 1.5);
  const laneTarget = clamp(a.lane0 * 0.6 + Math.sin(a.laneT) * 2.8 + a.push, -ROAD_HALF + 1.8, ROAD_HALF - 1.8);
  a.lane += (laneTarget - a.lane) * Math.min(1, dt * 1.5);

  const i = sampleAt(track, a.t, aiPoint);
  const n = track.normals[i];
  const nx = aiPoint.x + n.x * a.lane, nz = aiPoint.z + n.z * a.lane;
  const dx = nx - a.pos.x, dz = nz - a.pos.z;
  if (dx * dx + dz * dz > 1e-6) {
    const h = Math.atan2(dx, dz);
    let dh = h - a.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    a.heading += dh * Math.min(1, dt * 10);
    a.steer += (clamp(dh * 8, -1, 1) - a.steer) * Math.min(1, dt * 5);
  }
  a.pos.set(nx, 0, nz);
  if (a.finishTime == null && a.progress >= LAPS * N) a.finishTime = raceTime;
  a.fs = a.speed;
  applyVisuals(a, dt, !brk, brk);
}

function separateAIs(dt) {
  for (let i = 0; i < ais.length; i++) for (let j = i + 1; j < ais.length; j++) {
    const a = ais[i], b = ais[j];
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
    if (dx * dx + dz * dz < 16) {
      const back = a.progress < b.progress ? a : b, front = back === a ? b : a;
      back.speed = Math.min(back.speed, front.speed * 0.98);
      back.push += (back.lane >= front.lane ? 1 : -1) * dt * 6;
    }
  }
}

// ---------- Camera bám đuôi xe ----------
let camH = 0;
const camPos = new THREE.Vector3(), camWant = new THREE.Vector3(), camDir = new THREE.Vector3();
function chaseTarget() {
  camDir.set(Math.sin(camH), 0, Math.cos(camH));
  camWant.set(player.pos.x - camDir.x * 8.2, 3.3, player.pos.z - camDir.z * 8.2);
}
function snapCamera() { camH = player.heading; chaseTarget(); camPos.copy(camWant); }
function updateCamera(dt) {
  if (state === 'menu') {
    menuT += dt * 0.12;
    const c = player.pos;
    camera.position.set(c.x + Math.sin(menuT) * 20, 6.5, c.z + Math.cos(menuT) * 20);
    camera.lookAt(c.x, 1.2, c.z);
    return;
  }
  let dh = player.heading - camH;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  camH += dh * (1 - Math.exp(-dt * 4));
  chaseTarget();
  camPos.lerp(camWant, 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2);
  }
  camera.lookAt(player.pos.x + camDir.x * 6, 1.3, player.pos.z + camDir.z * 6);
  const ratio = Math.min(1, Math.abs(player.fs) / MAX_SPEED);
  camera.fov += (60 + ratio * 18 - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}

// ---------- Bản đồ nhỏ ----------
const mm = $('minimap'), mctx = mm.getContext('2d'), mmBg = document.createElement('canvas');
const MM = 300;
let mmS = 1, mmOx = 0, mmOz = 0;
(function setupMinimap() {
  mm.width = mm.height = mmBg.width = mmBg.height = MM;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of track.samples) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const pad = 28, span = Math.max(maxX - minX, maxZ - minZ);
  mmS = (MM - pad * 2) / span;
  mmOx = pad + ((MM - pad * 2) - (maxX - minX) * mmS) / 2 - minX * mmS;
  mmOz = pad + ((MM - pad * 2) - (maxZ - minZ) * mmS) / 2 - minZ * mmS;
  const g = mmBg.getContext('2d');
  g.lineJoin = 'round';
  g.beginPath();
  track.samples.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, p.x * mmS + mmOx, p.z * mmS + mmOz));
  g.closePath();
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 14; g.stroke();
  g.strokeStyle = '#2f3240'; g.lineWidth = 9; g.stroke();
  const s0 = track.samples[0];
  g.fillStyle = '#ffd166'; g.fillRect(s0.x * mmS + mmOx - 5, s0.z * mmS + mmOz - 5, 10, 10);
})();
function drawMinimap() {
  mctx.clearRect(0, 0, MM, MM);
  mctx.drawImage(mmBg, 0, 0);
  for (const r of [...ais, player]) {
    mctx.beginPath();
    mctx.arc(r.pos.x * mmS + mmOx, r.pos.z * mmS + mmOz, r === player ? 11 : 8, 0, Math.PI * 2);
    mctx.fillStyle = r.color; mctx.fill();
    if (r === player) { mctx.lineWidth = 4; mctx.strokeStyle = '#fff'; mctx.stroke(); }
  }
}

// ---------- HUD ----------
function updateHUD() {
  const lap = clamp(Math.floor(player.progress / track.N) + 1, 1, LAPS);
  $('vong').textContent = `${lap}/${LAPS}`;
  $('thoi-gian').textContent = fmt(player.finishTime ?? raceTime);
  $('hang').textContent = `${playerRank()}/4`;
  const kmh = Math.round(Math.abs(player.fs) * KMH);
  $('toc-do').textContent = kmh;
  $('thanh').style.width = Math.min(100, (kmh / (MAX_SPEED * KMH)) * 100) + '%';
  $('canh-bao').textContent = player.wrong > 1 ? '⚠ SAI HƯỚNG!' : '';
  drawMinimap();
}

// ---------- Vòng lặp chính ----------
function update(dt) {
  if (state === 'countdown') {
    countdown -= dt;
    $('dem-nguoc').textContent = countdown > 0 ? Math.ceil(countdown) : '';
    if (countdown <= 0) { state = 'race'; goTimer = 1; }
  }
  if (goTimer > 0) {
    goTimer -= dt;
    $('dem-nguoc').textContent = goTimer > 0 ? 'XUẤT PHÁT!' : '';
  }
  if ((state === 'race' || state === 'done') && player.finishTime == null) raceTime += dt;

  updatePlayer(dt);
  for (const a of ais) updateAI(a, dt);
  separateAIs(dt);
  smoke.update(dt);
  updateCamera(dt);

  world.sun.position.copy(player.pos).addScaledVector(world.sunDir, 160);
  world.sun.target.position.copy(player.pos);

  if (state !== 'menu') updateHUD();
  const revving = (state === 'race' || state === 'countdown') && input.up;
  engine.update(Math.min(1, Math.abs(player.fs) / MAX_SPEED), revving ? 1 : 0, muted || state === 'menu');
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  update(dt);
  render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

placeOnGrid();
showBest();
frame();

// Cho phép kiểm tra trạng thái game từ công cụ phát triển của trình duyệt
window.__game = {
  get state() { return state; }, player, ais, track, startRace, toMenu,
  // Chạy nhanh n bước (dùng khi kiểm thử tự động)
  step(n = 60, dt = 1 / 60, draw = true) { for (let i = 0; i < n; i++) update(dt); if (draw) render(); },
};
