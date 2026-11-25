// ĐƯỜNG ĐUA HOÀNG HÔN - game đua xe 3D (Three.js)
import * as THREE from 'three';
import './style.css';
import { createTrack, buildTrackMeshes, nearest, sampleAt, heightAt, heightAtT, ROAD_HALF, CURB_W, WALL_DIST } from './track.js';
import { buildWorld, exposureOf } from './scenery.js';
import { createCar } from './car.js';
import { createBike } from './bike.js';
import { STAGES } from './stages.js';
import { JOURNEY, newJourney, loadJourney, saveJourney, loadJourneyBest, saveJourneyBest, inProgress } from './journey.js';
import { input, setupInput } from './input.js';
import { Smoke, EngineSound, Explosions } from './effects.js';
import { createCombat, ITEMS } from './combat.js';
import { createObstacles } from './obstacles.js';
import { createHazards } from './hazards.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MAX_SPEED = 62;    // tốc độ tối đa (đơn vị game / giây)
const KMH = 3.4;         // hệ số đổi ra km/h để hiển thị
const STEP = 1 / 60;     // vật lý luôn tính theo bước 1/60 giây => máy chậm game không bị chậm theo
const GRAVITY = 28;
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- Cài đặt người chơi (lưu trong trình duyệt) ----------
const settings = { doKho: 'vua', doHoa: 'tu-dong', hoTro: 'bat', chang: 'hoang-hon' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('dua-xe-cai-dat')) || {}); } catch (e) { /* bỏ qua */ }
const saveSettings = () => { try { localStorage.setItem('dua-xe-cai-dat', JSON.stringify(settings)); } catch (e) { /* bỏ qua */ } };
if (!STAGES[settings.chang]) settings.chang = 'hoang-hon';
// Đang đi hành trình Phượt Xuyên Việt? Nếu có thì dùng đường đua của chặng hiện tại
let journey = loadJourney();
const inJourney = !!(journey && journey.open && inProgress(journey));
const leg = inJourney ? JOURNEY.legs[journey.leg] : null;
const stageId = inJourney ? leg.stage : settings.chang;
const stage = inJourney
  ? { ...STAGES[stageId], name: leg.from + ' → ' + leg.to, banner: (leg.from + ' → ' + leg.to).toUpperCase(), noSnow: true }
  : STAGES[stageId]; // chặng đang chơi
const LAPS = inJourney ? JOURNEY.laps : 3; // số vòng đua
const LEG_SKILL = inJourney ? leg.skill : 1; // chặng sau đối thủ mạnh hơn
const SKILL = { de: 0.78, vua: 0.88, kho: 0.98 }; // tốc độ xe máy theo độ khó

// ---------- Khởi tạo đồ hoạ ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = exposureOf(stage.theme);
renderer.shadowMap.type = THREE.PCFShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 6000);

const track = createTrack(stage);
buildTrackMeshes(scene, track, stage.theme);
const world = buildWorld(scene, renderer, track, stage);
const obstacles = createObstacles(scene, track, stage.plan);
const hazards = createHazards(scene, track, stage.hazards, stage.jumps); // trâu, xe tải, đá lở, tàu hoả, mưa, ổ gà, xu, vòng lửa
const smoke = new Smoke(scene);
const explosions = new Explosions(scene);
const engine = new EngineSound();
setupInput();
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('co-cham');

// ---------- Chất lượng đồ hoạ ----------
const QUALITY = {
  thap: { pr: 0.75, shadows: false, bloom: false },
  vua: { pr: 1, shadows: true, size: 1024, bloom: false },
  cao: { pr: Math.min(devicePixelRatio, 1.5), shadows: true, size: 2048, bloom: true },
};
let quality = null, composer = null, useBloom = false;
function applyQuality(name) {
  if (quality === name) return;
  quality = name;
  const q = QUALITY[name];
  renderer.setPixelRatio(q.pr);
  renderer.setSize(innerWidth, innerHeight);
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
    });
  }
  world.sun.castShadow = q.shadows;
  if (q.shadows && world.sun.shadow.mapSize.x !== q.size) {
    world.sun.shadow.mapSize.set(q.size, q.size);
    if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  }
  if (q.bloom && !composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.5, 0.88));
    composer.addPass(new OutputPass());
  }
  if (composer) { composer.setPixelRatio(q.pr); composer.setSize(innerWidth, innerHeight); }
  useBloom = q.bloom;
}
const autoQuality = () => (isTouch ? 'thap' : 'vua');
applyQuality(settings.doHoa === 'tu-dong' ? autoQuality() : settings.doHoa);
const render = () => (useBloom && composer ? composer.render() : renderer.render(scene, camera));

// ---------- Xe đua ----------
// extra.helmet: có giá trị => đây là xe máy (màu mũ bảo hiểm của người lái)
function makeRacer(color, extra = {}) {
  const bike = extra.helmet != null;
  const car = bike ? createBike(color, extra.helmet) : createCar(color);
  scene.add(car.group);
  return {
    car, bike, rad: bike ? 0.9 : 1.7, color: '#' + color.toString(16).padStart(6, '0'),
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, steer: 0, spin: 0, pitch: 0, lean: 0,
    idx: 0, progress: 0, finishTime: null, fs: 0, slip: 0, wrong: 0, ...extra,
  };
}
const player = makeRacer(0xe63946);
const ais = [
  makeRacer(0x1d8fe1, { skill: 0.97, laneSpeed: 0.35 }),
  makeRacer(0xf4c430, { skill: 1.0, laneSpeed: 0.27 }),
  makeRacer(0x2ec4b6, { skill: 1.03, laneSpeed: 0.31 }),
  makeRacer(0xff7b00, { skill: 0.96, laneSpeed: 0.45, helmet: 0xffffff }), // xe máy cam
  makeRacer(0x8e44ad, { skill: 1.0, laneSpeed: 0.4, helmet: 0xffd166 }),  // xe máy tím
];
const racers = [player, ...ais];
// Xe cảnh sát: chỉ xuất hiện khi bị camera bắn tốc độ (không tính vào xếp hạng)
const police = makeRacer(0xf4f4f4);
police.active = false;
// Vị trí xuất phát: [lùi sau vạch bao nhiêu điểm, lệch ngang]
const GRID = [[30, -3.5], [12, 3.5], [12, -3.5], [30, 3.5], [21, 0], [39, 0]];

function placeOnGrid() {
  const N = track.N;
  racers.forEach((r, i) => {
    const idx = N - GRID[i][0], lat = GRID[i][1];
    const p = track.samples[idx], n = track.normals[idx], t = track.tangents[idx];
    r.pos.set(p.x + n.x * lat, track.heights[idx], p.z + n.z * lat);
    r.heading = Math.atan2(t.x, t.z);
    r.vel.set(0, 0, 0);
    Object.assign(r, {
      steer: 0, idx, t: idx, progress: idx - N, speed: 0, lane: lat, lane0: lat, laneT: Math.random() * 6, push: 0,
      finishTime: null, fs: 0, slip: 0, wrong: 0, oil: 0, boost: 0, y: r.pos.y, vy: 0, air: false, pitch: 0, lean: 0, lastHeading: r.heading,
      wreck: 0, hopV: 0, hopY: 0, spinVis: 0, noProg: 0, progMark: undefined,
    });
    applyVisuals(r, 0, false, false);
  });
}

const combat = createCombat({
  scene, track, cfg: stage.combat, player, ais, police, explosions, sound: engine, hazards, smoke,
  avoidLane, applyVisuals, rank: () => playerRank(), maxSpeed: MAX_SPEED, kmh: KMH,
});

// ---------- Trạng thái game ----------
let state = 'menu';         // menu | countdown | race | done
let countdown = 0, raceTime = 0, goTimer = 0, menuT = 0, shake = 0, raceId = 0;
let muted = false, finishShown = false;
let coins = 0, hazardMsg = null, hazardMsgT = 0, aiMines = []; // số xu nhặt được, thông báo va chạm
let best = null;
const BEST_KEY = settings.chang === 'hoang-hon' ? 'dua-xe-ky-luc' : 'dua-xe-ky-luc-' + settings.chang;
if (!inJourney) try { best = Number(localStorage.getItem(BEST_KEY)) || null; } catch (e) { /* trình duyệt chặn lưu */ }

const fmt = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
function showBest() { $('ky-luc-menu').textContent = best ? 'Kỷ lục chặng ' + stage.name + ': ' + fmt(best) : ''; }

function startRace() {
  raceId++;
  placeOnGrid();
  smoke.clear();
  obstacles.reset();
  hazards.reset(); combat.reset(); explosions.clear(); coins = 0; hazardMsg = null; hazardMsgT = 0;
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
$('nut-vat-pham').addEventListener('pointerdown', (e) => { e.preventDefault(); if (state === 'race') combat.useItem(); });
function flashScreen() { const f = $('chop'); f.classList.remove('chop'); void f.offsetWidth; f.classList.add('chop'); }
addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    if (inJourney) { if (finishShown) $('nut-ht-chinh').click(); else if (state === 'menu') $('ht-bat-dau').click(); }
    else if (state === 'menu' || finishShown) startRace();
  }
  if (e.code === 'KeyM') toggleMute();
  if ((e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && state === 'race') combat.useItem();
});

// Các nút tuỳ chọn ở menu (độ khó, đồ hoạ, hỗ trợ lái)
document.querySelectorAll('.nhom[data-opt]').forEach((group) => {
  const key = group.dataset.opt;
  const mark = () => group.querySelectorAll('button').forEach((b) => b.classList.toggle('chon', b.dataset.v === settings[key]));
  group.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    settings[key] = b.dataset.v;
    saveSettings(); mark();
    // Đổi chặng: tải lại trang để dựng đường đua và cảnh vật mới
    if (key === 'chang' && b.dataset.v !== stageId) { $('nut-bat-dau').textContent = 'ĐANG TẢI CHẶNG...'; setTimeout(() => location.reload(), 30); }
    if (key === 'doHoa') applyQuality(b.dataset.v === 'tu-dong' ? autoQuality() : b.dataset.v);
  }));
  mark();
});

function playerRank() {
  let rank = 1;
  for (const a of ais) {
    if (player.finishTime != null) { if (a.finishTime != null && a.finishTime < player.finishTime) rank++; }
    else if (a.finishTime != null || a.progress > player.progress) rank++;
  }
  return rank;
}

// Tiêu đề màn kết quả: biểu tượng tách riêng (chữ tiêu đề tô màu chuyển sắc sẽ làm biểu tượng bị mất màu)
function setTitle(icon, text) { $('kq-icon').textContent = icon; $('kq-tieu-de').textContent = text; }

function showResults(id) {
  if (id !== raceId) return;
  finishShown = true;
  const rank = playerRank(), t = player.finishTime;
  if (inJourney) { showJourneyResult(rank, t); return; }
  const newBest = best == null || t < best;
  if (newBest) { best = t; try { localStorage.setItem(BEST_KEY, String(t)); } catch (e) { /* bỏ qua */ } }
  setTitle(rank === 1 ? '🏆' : '🏁', rank === 1 ? 'CHIẾN THẮNG!' : 'VỀ ĐÍCH!');
  $('kq-hang').textContent = `Hạng ${rank}/${racers.length}`;
  $('kq-thoi-gian').textContent = 'Thời gian: ' + fmt(t) + (newBest ? ' — kỷ lục mới!' : '');
  $('kq-ky-luc').textContent = 'Kỷ lục: ' + fmt(best) + ' · 🪙 Nhặt được ' + coins + ' xu';
  $('ket-qua').classList.remove('an-di');
}

// ---------- PHƯỢT XUYÊN VIỆT ----------
const hearts = (n) => '❤️'.repeat(n) + '🤍'.repeat(JOURNEY.retries - n);
const reloadPage = () => setTimeout(() => location.reload(), 30);
function goJourney(j) { journey = j; j.open = true; saveJourney(j); $('nut-xuyen-viet').textContent = 'ĐANG LÊN ĐƯỜNG...'; reloadPage(); }
function leaveJourney() { journey.open = false; saveJourney(journey); reloadPage(); }

// Vẽ lộ trình: điểm đã qua (xanh), điểm đang tới (nhấp nháy), điểm sắp mở (mờ)
function renderJourneyMap() {
  const j = journey, total = JOURNEY.legs.length;
  $('ht-lo-trinh').innerHTML = JOURNEY.stops.map((st, i) => {
    let cls = '', tag = '';
    if (st.soon) { cls = 'khoa'; tag = 'sắp mở'; }
    else if (i === 0 || st.leg < j.leg) { cls = 'xong'; tag = i === 0 ? st.note : fmt(j.times[st.leg]); }
    else if (st.leg === j.leg) { cls = 'dang'; tag = 'đang tới'; }
    return '<li class="' + cls + '">' + st.name + '<small>' + tag + '</small></li>';
  }).join('');
  $('ht-phu-de').textContent = JOURNEY.stops[0].name + ' → ' + JOURNEY.legs[total - 1].to + ' · ' + total + ' chặng';
  $('ht-so-chang').textContent = 'CHẶNG ' + (j.leg + 1) + '/' + total;
  $('ht-ten-chang').textContent = leg.from + ' → ' + leg.to;
  $('ht-mo-ta').textContent = leg.desc;
  $('ht-luat').textContent = JOURNEY.laps + ' vòng · về top ' + JOURNEY.top + ' để đi tiếp';
  $('ht-mang').textContent = 'Lượt thử lại: ' + hearts(j.retries);
  $('ht-lam-lai').parentElement.classList.toggle('an-di', j.leg === 0 && j.retries === JOURNEY.retries);
}

function setupJourneyUI() {
  // Nút ở menu: bắt đầu mới hoặc đi tiếp hành trình đang dở
  if (inProgress(journey)) $('nut-xuyen-viet').textContent = '▶ TIẾP TỤC PHƯỢT (chặng ' + (journey.leg + 1) + '/' + JOURNEY.legs.length + ')';
  $('nut-xuyen-viet').addEventListener('click', () => goJourney(inProgress(journey) ? journey : newJourney()));
  if (!inJourney) return;
  $('menu').classList.add('an-di');
  $('hanh-trinh').classList.remove('an-di');
  renderJourneyMap();
  $('ht-bat-dau').addEventListener('click', () => { $('hanh-trinh').classList.add('an-di'); startRace(); });
  $('ht-menu').addEventListener('click', leaveJourney);
  $('ht-lam-lai').addEventListener('click', (e) => { e.preventDefault(); goJourney(newJourney()); });
  $('nut-dua-lai').classList.add('an-di');
  $('nut-menu').classList.add('an-di');
  for (const id of ['nut-ht-chinh', 'nut-ht-phu']) {
    $(id).classList.remove('an-di');
    $(id).addEventListener('click', () => journeyAction[id] && journeyAction[id]());
  }
}

// Kết quả sau mỗi chặng: qua chặng / thử lại / hết lượt / về đích cuối cùng
const journeyAction = {};
function showJourneyResult(rank, t) {
  const j = journey, total = JOURNEY.legs.length;
  const pass = rank <= JOURNEY.top;
  const setBtns = (main, mainFn, sub, subFn) => {
    $('nut-ht-chinh').textContent = main; journeyAction['nut-ht-chinh'] = mainFn;
    $('nut-ht-phu').textContent = sub; journeyAction['nut-ht-phu'] = subFn;
  };
  $('kq-hang').textContent = 'Hạng ' + rank + '/' + racers.length;
  $('kq-thoi-gian').textContent = 'Thời gian chặng: ' + fmt(t) + ' · 🪙 ' + coins + ' xu';
  if (pass) {
    j.times[j.leg] = t;
    j.coins = (j.coins || 0) + coins;
    j.leg++;
    if (j.leg >= total) {
      j.finished = true; j.open = false;
      const sum = j.times.reduce((a, b) => a + b, 0), prev = loadJourneyBest();
      const newBest = prev == null || sum < prev;
      if (newBest) saveJourneyBest(sum);
      setTitle('🎉', 'ĐÃ ĐẾN ' + leg.to.toUpperCase() + '!');
      $('kq-ky-luc').textContent = 'Tổng thời gian hành trình: ' + fmt(sum) + (newBest ? ' — kỷ lục mới!' : ' · Kỷ lục: ' + fmt(prev));
      setBtns('ĐI LẠI TỪ ĐẦU', () => goJourney(newJourney()), 'MENU', reloadPage);
    } else {
      const next = JOURNEY.legs[j.leg];
      setTitle('✅', 'ĐÃ ĐẾN ' + leg.to.toUpperCase() + '!');
      $('kq-ky-luc').textContent = 'Chặng tiếp theo: ' + next.from + ' → ' + next.to;
      setBtns('ĐI TIẾP ➜ ' + next.to.toUpperCase(), () => goJourney(j), 'MENU', leaveJourney);
    }
  } else if (j.retries > 0) {
    j.retries--;
    setTitle('😓', 'CHƯA VÀO TOP ' + JOURNEY.top);
    $('kq-ky-luc').textContent = 'Lượt thử lại còn: ' + hearts(j.retries);
    setBtns('ĐUA LẠI CHẶNG NÀY', () => { $('ket-qua').classList.add('an-di'); startRace(); }, 'MENU', leaveJourney);
  } else {
    j.over = true; j.open = false;
    setTitle('💥', 'HÀNH TRÌNH DỪNG LẠI');
    $('kq-ky-luc').textContent = 'Bạn đã đi được ' + j.leg + '/' + total + ' chặng. Hết lượt thử lại.';
    setBtns('ĐI LẠI TỪ ĐẦU', () => goJourney(newJourney()), 'MENU', reloadPage);
  }
  saveJourney(j);
  $('ket-qua').classList.remove('an-di');
}

// ---------- Hiển thị xe (bánh quay, thân nghiêng, ngóc đầu theo dốc, đèn phanh) ----------
function applyVisuals(r, dt, thr, brk) {
  const c = r.car;
  c.group.position.copy(r.pos);
  c.group.rotation.y = r.heading + (r.spinVis || 0);
  c.group.rotation.x = r.pitch;
  r.spin += (r.fs * dt) / 0.42;
  for (const w of c.wheels) {
    w.spin.rotation.x = r.spin;
    if (w.front) w.pivot.rotation.y = r.steer * 0.5;
  }
  const ratio = Math.min(1, Math.abs(r.fs) / MAX_SPEED);
  const k = Math.min(1, dt * 6);
  if (r.bike) {
    // Xe máy nghiêng vào trong khúc cua: góc nghiêng theo tốc độ x tốc độ quay đầu
    const turn = dt > 0 ? wrapAngle(r.heading - (r.lastHeading ?? r.heading)) / dt : 0;
    r.lastHeading = r.heading;
    const want = clamp(-Math.atan((r.fs * turn) / 30), -0.7, 0.7);
    r.lean += (want - r.lean) * Math.min(1, dt * 4);
    c.chassis.rotation.z = r.lean;
  } else c.chassis.rotation.z += (r.steer * ratio * 0.06 - c.chassis.rotation.z) * k;
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
  const ground = r.air ? 0.4 : 1; // đang bay thì điều khiển kém hơn
  const thr = drive && input.up, brk = drive && input.down, hb = drive && input.handbrake;

  fwd.set(Math.sin(r.heading), 0, Math.cos(r.heading));
  let fs = r.vel.dot(fwd);
  if (thr) r.vel.addScaledVector(fwd, 30 * (1 - Math.max(0, fs) / (MAX_SPEED * 1.05)) * dt * ground);
  if (brk) {
    if (fs > 1) r.vel.addScaledVector(fwd, -45 * dt * ground);
    else if (fs > -16) r.vel.addScaledVector(fwd, -14 * dt * ground);
  }

  // Đánh lái: càng nhanh càng bẻ lái nhẹ đi cho dễ kiểm soát
  const target = drive ? (input.left ? 1 : 0) - (input.right ? 1 : 0) : 0;
  r.steer += (target - r.steer) * Math.min(1, dt * 8);
  fs = r.vel.dot(fwd);
  const ratio = Math.min(1, Math.abs(fs) / MAX_SPEED);
  const steerPower = Math.min(1, Math.abs(fs) / 8) * (1 - 0.35 * ratio) * ground;
  r.heading += r.steer * 1.75 * steerPower * Math.sign(fs) * (hb ? 1.4 : 1) * dt;

  // Hỗ trợ lái: khi không bấm trái/phải, xe tự hướng về một điểm phía trước trên mặt đường
  // (giữ nguyên làn đang chạy, kéo xe về mặt đường nhựa nếu bị dạt ra lề, và lách chướng ngại vật)
  if (settings.hoTro === 'bat' && drive && target === 0 && fs > 5) {
    const ahead = (near.idx + 18) % track.N;
    const lane = avoidLane(near.idx, clamp(near.lateral, -ROAD_HALF + 2.5, ROAD_HALF - 2.5), 95).lane;
    const s = track.samples[ahead], n = track.normals[ahead];
    const d = wrapAngle(Math.atan2(s.x + n.x * lane - r.pos.x, s.z + n.z * lane - r.pos.z) - r.heading);
    if (Math.abs(d) < 0.8) r.heading += d * Math.min(1, dt * 4) * ground;
  }

  r.oil = Math.max(0, r.oil - dt);
  r.boost = Math.max(0, r.boost - dt);
  if (r.oil > 0) r.heading += Math.sin(raceTime * 11) * 0.8 * steerPower * dt; // dính dầu: xe lắc đuôi
  fwd.set(Math.sin(r.heading), 0, Math.cos(r.heading));
  if (r.boost > 0 && drive) r.vel.addScaledVector(fwd, 38 * dt); // ô tăng tốc đẩy xe lên

  // Độ bám đường: phần vận tốc trượt ngang bị triệt dần (phanh tay / vũng dầu => trượt nhiều)
  fs = r.vel.dot(fwd);
  lat.copy(r.vel).addScaledVector(fwd, -fs);
  r.slip = lat.length();
  r.rain = hazards.inRain(near.idx);
  const grip = (r.oil > 0 ? 0.9 : hb ? 1.8 : offroad ? 4.5 : 8.5) * (r.air ? 0.1 : 1) * (r.rain ? 0.5 : 1);
  r.vel.addScaledVector(lat, -Math.min(1, grip * dt));

  const drag = (offroad && !r.air ? 0.9 : 0.16) + (thr ? 0 : 0.3) + (hb ? 0.5 : 0);
  r.vel.multiplyScalar(Math.max(0, 1 - drag * dt));
  const maxS = offroad ? 38 : r.boost > 0 ? MAX_SPEED * 1.4 : MAX_SPEED;
  const sp = r.vel.length();
  if (sp > maxS) r.vel.setLength(sp + (maxS - sp) * Math.min(1, 3 * dt));
  if (r.finishTime != null) r.vel.multiplyScalar(1 - Math.min(1, 1.2 * dt)); // về đích thì tự giảm tốc

  r.pos.x += r.vel.x * dt;
  r.pos.z += r.vel.z * dt;

  // Va tường chắn: xe trượt dọc theo tường thay vì bị nảy mạnh
  const n2 = nearest(track, r.pos, near.idx);
  const nrm = track.normals[n2.idx];
  const lim = WALL_DIST - 1.3;
  if (Math.abs(n2.lateral) > lim) {
    const s = Math.sign(n2.lateral);
    r.pos.addScaledVector(nrm, -(n2.lateral - s * lim));
    const vn = r.vel.dot(nrm);
    if (vn * s > 0) {
      r.vel.addScaledVector(nrm, -vn * 1.15);
      r.vel.multiplyScalar(0.94);
      shake = Math.min(0.5, shake + Math.abs(vn) * 0.02);
    }
  }

  // Va chạm với xe đối thủ
  for (const a of ais) {
    diff.subVectors(r.pos, a.pos); diff.y = 0;
    const d = diff.length();
    const minD = r.rad + a.rad;
    if (d < minD && d > 0.001 && Math.abs(r.pos.y - a.pos.y) < 1.5) {
      diff.multiplyScalar((minD - d) / d);
      r.pos.addScaledVector(diff, 0.7);
      const side = (a.pos.x - r.pos.x) * nrm.x + (a.pos.z - r.pos.z) * nrm.z;
      a.push += Math.sign(side || 1) * 1.2;
      combat.ram(a);
      r.vel.multiplyScalar(0.96);
      a.speed *= 0.97;
      shake = Math.min(0.5, shake + 0.08);
    }
  }

  hitObstacles(r);
  const ev = hazards.collide(r, near.idx, dt);
  if (ev.shake) shake = Math.min(0.9, shake + ev.shake);
  if (ev.msg) { hazardMsg = ev.msg; hazardMsgT = 1.4; }
  if (ev.boost) r.boost = Math.max(r.boost, ev.boost);
  if (ev.coins && drive) coins += ev.coins;
  for (const p of ev.sparkle) for (let k = 0; k < 4; k++) smoke.spawn(p, k % 2 ? '#ffd166' : '#fff3b0', 0.5);

  // Chống kẹt: giữ ga mà xe đứng im (kẹt vào thùng phuy / tường) thì xe tự trượt dần về giữa đường
  r.stuck = thr && Math.abs(r.vel.dot(fwd)) < 3 ? (r.stuck || 0) + dt : 0;
  if (r.stuck > 0.6) r.pos.addScaledVector(nrm, (n2.lateral > 0 ? -1 : 1) * 6 * dt);
  // Cứu hộ: kẹt quá lâu (hoặc bấm R) thì đưa xe về giữa đường, quay đúng hướng
  // Kẹt kiểu khác (bị ép giữa xe cảnh sát và thùng phuy...): giữ ga mà 4 giây không tiến lên được
  if (thr) { r.noProg = (r.noProg || 0) + dt; if (r.progress > (r.progMark ?? -1e9) + 8) { r.progMark = r.progress; r.noProg = 0; } } else r.noProg = 0;
  if (drive && (r.stuck > 2.5 || rescueAsked || r.wrong > 5 || r.noProg > 4)) { rescueAsked = false; rescue(r, n2.idx); return; }

  // Độ cao: bám mặt đường, nhưng qua đỉnh dốc đủ nhanh thì xe bay lên
  const gy = heightAt(track, n2.idx, r.pos);
  const groundVy = r.vel.dot(track.tangents[n2.idx]) * track.slopes[n2.idx];
  if (r.air) {
    r.vy -= GRAVITY * dt;
    r.y += r.vy * dt;
    if (r.y <= gy) { // tiếp đất
      const impact = groundVy - r.vy;
      r.y = gy; r.air = false; r.vy = groundVy;
      if (impact > 6) { shake = Math.min(0.8, shake + impact * 0.03); emitSmoke(r, '#d9c3a0'); }
    }
  } else if (r.vy - groundVy > GRAVITY * dt && r.vy > 1) {
    r.air = true; // mặt đường hạ xuống nhanh hơn trọng lực kéo xe => bay
    r.vy -= GRAVITY * dt;
    r.y += r.vy * dt;
  } else {
    r.vy = groundVy; r.y = gy;
  }
  r.pos.y = r.y;
  const fsNow = Math.max(10, Math.abs(r.vel.dot(fwd)));
  const pitchTarget = r.air ? -Math.atan2(r.vy, fsNow) * 0.8 : -Math.atan(track.slopes[n2.idx]) * Math.sign(r.vel.dot(track.tangents[n2.idx]) || 1);
  r.pitch += (pitchTarget - r.pitch) * Math.min(1, dt * 8);

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
  if (!r.air) {
    if (r.slip > 5 && Math.abs(r.fs) > 8) emitSmoke(r, '#e6e6e6');
    else if (offroad && Math.abs(r.fs) > 10) emitSmoke(r, '#b48c5c');
  }
  if (r.boost > 0) { // lửa phụt ra sau xe khi tăng tốc
    wheelPos.set((Math.random() - 0.5) * 0.8, 0.55, -2.5);
    r.car.group.localToWorld(wheelPos);
    smoke.spawn(wheelPos, Math.random() < 0.5 ? '#ffb347' : '#ff6a00', 0.7);
  }
}

let rescueAsked = false, rescueMsg = 0;
addEventListener('keydown', (e) => { if (e.code === 'KeyR' && state === 'race') rescueAsked = true; });
function rescue(r, idx) {
  const lane = avoidLane(idx, 0, 12).lane;
  const p = track.samples[idx], n = track.normals[idx], t = track.tangents[idx];
  r.pos.set(p.x + n.x * lane, track.heights[idx], p.z + n.z * lane);
  r.heading = Math.atan2(t.x, t.z);
  r.vel.set(0, 0, 0);
  Object.assign(r, { y: r.pos.y, vy: 0, air: false, pitch: 0, steer: 0, stuck: 0, wrong: 0, oil: 0, fs: 0, noProg: 0, progMark: r.progress });
  rescueMsg = 1.5;
  applyVisuals(r, 0, false, false);
}

// ---------- Va chạm với chướng ngại vật ----------
// Thân xe được coi như 2 hình tròn (đầu xe và đuôi xe)
function hitObstacles(r) {
  const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
  for (const o of obstacles.items) {
    const ox = o.pos.x - r.pos.x, oz = o.pos.z - r.pos.z, d2 = ox * ox + oz * oz;
    if (d2 > 64) continue; // ở xa thì bỏ qua cho nhanh
    const above = r.y > o.pos.y + 0.6; // xe đang bay ngang qua phía trên
    if (o.type === 'oil') { if (!above && d2 < o.r * o.r && r.oil < 1) r.oil = 1.4; continue; }
    if (o.type === 'boost') { if (!above && d2 < o.r * o.r && r.boost < 1.2) r.boost = 1.6; continue; }
    if (o.type === 'cone' && (o.knocked || r.y > o.pos.y + 0.9)) continue;
    if (o.type === 'barrel' && r.y > o.pos.y + 1.4) continue;
    for (const off of [1.3, -1.3]) {
      let dx = r.pos.x + fx * off - o.pos.x, dz = r.pos.z + fz * off - o.pos.z;
      const d = Math.hypot(dx, dz), min = 1.05 + o.r;
      if (d >= min || d < 1e-4) continue;
      dx /= d; dz /= d;
      if (o.type === 'cone') { // tông đổ cọc tiêu: xe chậm lại một chút
        obstacles.knock(o, r.vel, -dx, -dz);
        r.vel.multiplyScalar(0.94);
        shake = Math.min(0.5, shake + 0.12);
        break;
      }
      // Thùng phuy: rất nặng, xe bị bật ra và mất tốc độ
      r.pos.x += dx * (min - d); r.pos.z += dz * (min - d);
      const vn = r.vel.x * dx + r.vel.z * dz;
      if (vn < 0) {
        r.vel.x -= dx * vn * 1.3; r.vel.z -= dz * vn * 1.3;
        r.vel.multiplyScalar(0.7);
        shake = Math.min(0.8, shake + Math.abs(vn) * 0.04);
      }
      // Đâm gần như thẳng vào thùng: đẩy xe trượt sang bên để không bị kẹt
      const cross = fx * dz - fz * dx;
      if (Math.abs(cross) < 0.35) {
        const side = cross >= 0 ? 1 : -1;
        r.vel.x += -fz * side * 4; r.vel.z += fx * side * 4;
      }
    }
  }
}

// Xe máy tìm làn trống để lách qua chướng ngại vật phía trước
function avoidLane(t, want, look = 60) {
  const N = track.N, ai = ((Math.floor(t) % N) + N) % N;
  const blocks = [];
  for (const z of obstacles.zones) {
    const d0 = ((Math.floor(z.i0) - ai) % N + N) % N;
    if (d0 < look || d0 > N - (z.i1 - z.i0) - 1) blocks.push(z);
  }
  if (!blocks.length) return { lane: want, avoiding: false };
  const ok = (l) => blocks.every((z) => l < z.lat0 - 1.4 || l > z.lat1 + 1.4);
  if (ok(want)) return { lane: want, avoiding: false };
  let best = want, bestD = Infinity;
  for (let l = -ROAD_HALF + 1.6; l <= ROAD_HALF - 1.6; l += 0.4) {
    if (ok(l) && Math.abs(l - want) < bestD) { bestD = Math.abs(l - want); best = l; }
  }
  return { lane: best, avoiding: true };
}

// ---------- Xe đối thủ (máy điều khiển) ----------
const aiPoint = new THREE.Vector3();
function updateAI(a, dt) {
  if (state === 'menu' || state === 'countdown') { a.fs = 0; applyVisuals(a, dt, false, false); return; }
  const N = track.N;
  const k = ((Math.floor(a.t) + 12) % N + N) % N;
  const curv = Math.max(track.curvature[k], track.curvature[(k + 12) % N]);
  let target = 57 * a.skill * SKILL[settings.doKho] * LEG_SKILL * (1 - Math.min(0.5, curv * 0.9)); // giảm tốc trước khúc cua

  // Chạy theo nhóm: dẫn xa thì chậm lại chờ, bị bỏ xa thì tăng tốc đuổi theo
  if (player.finishTime == null) {
    const gap = a.progress - player.progress; // > 0: xe máy đang dẫn trước người chơi
    if (gap > 0) target *= Math.max(0.75, 1 - gap / 300);
    else if (gap < -30) target *= Math.min(1.1, 1 + (-gap - 30) / 500);
  }
  if (a.finishTime != null) target *= 0.5;
  target = Math.min(target, hazards.speedLimit(a.t, a.lane));
  if (hazards.inRain(k)) target *= 0.94;
  if (a.wreck > 0) { a.wreck -= dt; target = 0; }
  if (a.hopV || a.hopY) { a.hopV -= 28 * dt; a.hopY += a.hopV * dt; if (a.hopY <= 0) { a.hopY = 0; a.hopV = 0; } }
  a.spinVis = a.wreck > 0 ? a.spinVis + dt * 9 : wrapAngle(a.spinVis) * (1 - Math.min(1, dt * 5));
  const brk = target < a.speed - 3;
  a.speed += clamp(target - a.speed, -28 * dt, 14 * dt);
  const adv = (a.speed * dt) / track.segLen;
  a.t += adv;
  a.progress += adv;

  a.laneT += dt * a.laneSpeed;
  a.push *= 1 - Math.min(1, dt * 1.5);
  const wantLane = clamp(a.lane0 * 0.6 + Math.sin(a.laneT) * 2.8 + a.push, -ROAD_HALF + 1.8, ROAD_HALF - 1.8);
  const av = avoidLane(a.t, hazards.laneAdjust(a.t, wantLane));
  a.lane += (av.lane - a.lane) * Math.min(1, dt * (av.avoiding ? 4 : 1.5));

  const i = sampleAt(track, a.t, aiPoint);
  const n = track.normals[i];
  let nx = aiPoint.x + n.x * a.lane, nz = aiPoint.z + n.z * a.lane;
  // Chốt an toàn: nếu vẫn sát thùng phuy / cọc tiêu thì đẩy xe máy sang ngang
  for (const o of obstacles.items) {
    if ((o.type !== 'barrel' && o.type !== 'cone') || o.knocked) continue;
    const ox = nx - o.pos.x, oz = nz - o.pos.z, d = Math.hypot(ox, oz), min = 1.9 + o.r;
    if (d < min) {
      const side = ox * n.x + oz * n.z >= 0 ? 1 : -1;
      a.lane = clamp(a.lane + side * (min - d), -ROAD_HALF + 1, ROAD_HALF - 1);
      nx = aiPoint.x + n.x * a.lane; nz = aiPoint.z + n.z * a.lane;
      a.speed *= 0.995;
    }
  }
  for (const o of [...hazards.solids, ...aiMines]) {
    const ox = nx - o.pos.x, oz = nz - o.pos.z, d = Math.hypot(ox, oz), min = a.rad + 0.4 + o.r;
    if (d < min) {
      const side = ox * n.x + oz * n.z >= 0 ? 1 : -1;
      a.lane = clamp(a.lane + side * (min - d), -ROAD_HALF + 1, ROAD_HALF - 1);
      nx = aiPoint.x + n.x * a.lane; nz = aiPoint.z + n.z * a.lane;
      a.speed *= 0.99;
    }
  }
  const dx = nx - a.pos.x, dz = nz - a.pos.z;
  if (dx * dx + dz * dz > 1e-6) {
    const h = Math.atan2(dx, dz);
    const dh = wrapAngle(h - a.heading);
    a.heading += dh * Math.min(1, dt * 10);
    a.steer += (clamp(dh * 8, -1, 1) - a.steer) * Math.min(1, dt * 5);
  }
  a.pos.set(nx, heightAtT(track, a.t) + a.hopY, nz);
  a.pitch += (-Math.atan(track.slopes[i]) - a.pitch) * Math.min(1, dt * 8);
  if (a.finishTime == null && a.progress >= LAPS * N) a.finishTime = raceTime;
  a.fs = a.speed;
  applyVisuals(a, dt, !brk, brk);
}

function separateAIs(dt) {
  for (let i = 0; i < ais.length; i++) for (let j = i + 1; j < ais.length; j++) {
    const a = ais[i], b = ais[j];
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
    const md = a.rad + b.rad + 0.6;
    if (dx * dx + dz * dz < md * md) {
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
  camWant.set(player.pos.x - camDir.x * 8.2, player.pos.y + 3.3, player.pos.z - camDir.z * 8.2);
}
function snapCamera() { camH = player.heading; chaseTarget(); camPos.copy(camWant); }
function updateCamera(dt) {
  if (state === 'menu') {
    menuT += dt * 0.12;
    const c = player.pos;
    camera.position.set(c.x + Math.sin(menuT) * 20, c.y + 6.5, c.z + Math.cos(menuT) * 20);
    camera.lookAt(c.x, c.y + 1.2, c.z);
    return;
  }
  camH += wrapAngle(player.heading - camH) * (1 - Math.exp(-dt * 4));
  chaseTarget();
  camPos.lerp(camWant, 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2);
  }
  camera.lookAt(player.pos.x + camDir.x * 6, player.pos.y + 1.3, player.pos.z + camDir.z * 6);
  const ratio = Math.min(1, Math.abs(player.fs) / MAX_SPEED);
  camera.fov += (60 + ratio * 18 + (player.boost > 0 ? 9 : 0) - camera.fov) * Math.min(1, dt * 3);
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
  g.fillStyle = '#ffffff'; g.fillRect(s0.x * mmS + mmOx - 6, s0.z * mmS + mmOz - 6, 12, 12);
  // Chấm nhỏ đánh dấu chướng ngại vật: đỏ = thùng phuy, cam = cọc tiêu, tím = dầu, vàng = tăng tốc
  for (const m of hazards.marks) {
    if (m.type === 'rain') {
      g.beginPath();
      for (let i = m.i0; i <= m.i1; i++) { const p = track.samples[i % track.N]; (i === m.i0 ? g.moveTo : g.lineTo).call(g, p.x * mmS + mmOx, p.z * mmS + mmOz); }
      g.strokeStyle = 'rgba(80,170,255,.75)'; g.lineWidth = 12; g.stroke();
    }
  }
  const markCol = { buffalo: '#c68b59', train: '#ffffff', rock: '#a0a0a0', pothole: '#7a5c3a', mine: '#111111', box: '#ff5ec4', cam: '#2ef2ff' };
  for (const m of [...hazards.marks, ...combat.marks]) {
    if (!markCol[m.type]) continue;
    g.fillStyle = markCol[m.type]; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(m.pos.x * mmS + mmOx, m.pos.z * mmS + mmOz, m.type === 'train' ? 6 : 5, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const dotCol = { barrel: '#ff4d4d', cone: '#ff9f43', oil: '#9b5de5', boost: '#ffd166' };
  for (const o of obstacles.items) {
    g.fillStyle = dotCol[o.type];
    g.beginPath(); g.arc(o.pos.x * mmS + mmOx, o.pos.z * mmS + mmOz, 3.5, 0, Math.PI * 2); g.fill();
  }
})();
function drawMinimap() {
  mctx.clearRect(0, 0, MM, MM);
  mctx.drawImage(mmBg, 0, 0);
  for (const tr of hazards.trucks) {
    mctx.fillStyle = '#9aa0a6';
    mctx.fillRect(tr.group.position.x * mmS + mmOx - 6, tr.group.position.z * mmS + mmOz - 6, 12, 12);
  }
  if (police.active) {
    mctx.beginPath(); mctx.arc(police.pos.x * mmS + mmOx, police.pos.z * mmS + mmOz, 9, 0, Math.PI * 2);
    mctx.fillStyle = Math.floor(performance.now() / 200) % 2 ? '#ff2a2a' : '#2a5cff'; mctx.fill();
  }
  if (combat.raid.on) {
    const p = combat.plane.position, x = p.x * mmS + mmOx, z = p.z * mmS + mmOz;
    mctx.fillStyle = '#ffd166'; mctx.beginPath(); mctx.moveTo(x, z - 10); mctx.lineTo(x + 8, z + 8); mctx.lineTo(x - 8, z + 8); mctx.closePath(); mctx.fill();
  }
  for (const r of [...ais, player]) {
    mctx.beginPath();
    mctx.arc(r.pos.x * mmS + mmOx, r.pos.z * mmS + mmOz, r === player ? 11 : r.bike ? 6 : 8, 0, Math.PI * 2);
    mctx.fillStyle = r.color; mctx.fill();
    if (r === player) { mctx.lineWidth = 4; mctx.strokeStyle = '#fff'; mctx.stroke(); }
  }
}

// ---------- HUD (cập nhật ~12 lần/giây cho nhẹ máy) ----------
function updateHUD() {
  const lap = clamp(Math.floor(player.progress / track.N) + 1, 1, LAPS);
  $('vong').textContent = `${lap}/${LAPS}`;
  $('thoi-gian').textContent = fmt(player.finishTime ?? raceTime);
  $('hang').textContent = `${playerRank()}/${racers.length}`;
  const kmh = Math.round(Math.abs(player.fs) * KMH);
  $('toc-do').textContent = kmh;
  $('thanh').style.width = Math.min(100, (kmh / (MAX_SPEED * KMH)) * 100) + '%';
  $('xu').textContent = coins;
  const held = combat.held;
  $('vp-icon').textContent = combat.rolling ? ['🚀', '🛡️', '💣', '🧲', '⚡'][Math.floor(performance.now() / 90) % 5] : held ? ITEMS[held].icon : '—';
  $('vp-ten').textContent = combat.rolling ? 'ĐANG CHỌN...' : held ? ITEMS[held].name + (isTouch ? '' : ' (E)') : 'VẬT PHẨM';
  $('vat-pham').classList.toggle('co', !!held && !combat.rolling);
  const cw = combat.warning();
  const cb = $('canh-bao');
  const warn = hazards.warning(player.idx);
  const [txt, color] = rescueMsg > 0 ? ['🛟 CỨU HỘ: ĐƯA XE VỀ ĐƯỜNG', '#8ecae6']
    : hazardMsgT > 0 && hazardMsg ? hazardMsg
    : cw ? cw
    : player.wrong > 1 ? ['⚠ SAI HƯỚNG! (bấm R để quay lại)', '#ff4d6d']
    : warn ? warn
    : player.oil > 0 ? ['🛢 TRƠN TRƯỢT!', '#c77dff']
    : player.boost > 0 ? ['⚡ TĂNG TỐC!', '#ffd166']
    : player.air ? ['✈ BAY!', '#8ecae6'] : ['', ''];
  cb.textContent = txt; cb.style.color = color;
  drawMinimap();
}

// ---------- Đo tốc độ khung hình, tự hạ đồ hoạ nếu máy chạy chậm ----------
let fpsT = 0, fpsN = 0, slowCount = 0;
function watchFps(real) {
  fpsT += real; fpsN++;
  if (fpsT < 1) return;
  const fps = Math.round(fpsN / fpsT);
  fpsT = 0; fpsN = 0;
  $('fps').textContent = fps + ' FPS · ' + { thap: 'Thấp', vua: 'Vừa', cao: 'Cao' }[quality];
  if (settings.doHoa !== 'tu-dong' || state !== 'race') { slowCount = 0; return; }
  slowCount = fps < 42 ? slowCount + 1 : 0;
  if (slowCount >= 3 && quality !== 'thap') { applyQuality(quality === 'cao' ? 'vua' : 'thap'); slowCount = 0; }
}

// ---------- Vòng lặp chính ----------
function simulate(dt) {
  if (state === 'countdown') {
    countdown -= dt;
    $('dem-nguoc').textContent = countdown > 0 ? Math.ceil(countdown) : '';
    if (countdown <= 0) { state = 'race'; goTimer = 1; }
  }
  if (goTimer > 0) {
    goTimer -= dt;
    if (goTimer <= 0) $('dem-nguoc').textContent = '';
    else if ($('dem-nguoc').textContent !== 'XUẤT PHÁT!') $('dem-nguoc').textContent = 'XUẤT PHÁT!';
  }
  if ((state === 'race' || state === 'done') && player.finishTime == null) raceTime += dt;
  rescueMsg = Math.max(0, rescueMsg - dt);
  updatePlayer(dt);
  aiMines = combat.aiSolids();
  for (const a of ais) updateAI(a, dt);
  separateAIs(dt);
  if (state !== 'menu') hazards.update(dt, (t, want) => avoidLane(t, want, 60).lane);
  for (const p of hazards.landed) {
    const d = p.distanceTo(player.pos);
    if (d < 55) shake = Math.min(0.9, shake + (1 - d / 55) * 0.7);
    for (let k = 0; k < 6; k++) smoke.spawn(p, '#bfae96', 1.2);
  }
  hazardMsgT = Math.max(0, hazardMsgT - dt);
  if (state !== 'menu') combat.update(dt, state, player.finishTime == null);
  for (const ev of combat.drain()) {
    if (ev.msg) { hazardMsg = ev.msg; hazardMsgT = 1.8; }
    if (ev.shake) shake = Math.min(0.9, shake + ev.shake);
    if (ev.coins) coins = Math.max(0, coins + ev.coins);
    if (ev.flash) flashScreen();
  }
  explosions.update(dt);
  smoke.update(dt);
  obstacles.update(dt);
}

let hudT = 0, sceneT = 0;
function present(dt) {
  updateCamera(dt);
  world.sun.position.copy(player.pos).addScaledVector(world.sunDir, 160);
  world.sun.target.position.copy(player.pos);
  hazards.present(dt, camera, player.idx);
  sceneT += dt;
  world.update(dt, sceneT, player.pos, state === 'countdown' || (state === 'race' && raceTime < 4) || state === 'done');
  hudT -= dt;
  if (state !== 'menu' && hudT <= 0) { updateHUD(); hudT = 0.08; }
  const revving = (state === 'race' || state === 'countdown') && input.up;
  engine.update(Math.min(1, Math.abs(player.fs) / MAX_SPEED), revving ? 1 : 0, muted || state === 'menu');
}

const clock = new THREE.Clock();
let acc = 0;
function frame() {
  requestAnimationFrame(frame);
  const real = Math.min(clock.getDelta(), 0.1);
  acc += real;
  let n = 0;
  while (acc >= STEP && n < 6) { simulate(STEP); acc -= STEP; n++; }
  if (n === 6) acc = 0;
  present(real);
  render();
  watchFps(real);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

// Đèn pha xe người chơi khi đua đêm
if (stage.theme === 'night') {
  const head = new THREE.SpotLight(0xfff1d0, 120, 90, 0.5, 0.5, 1.3);
  head.position.set(0, 1.0, 1.8);
  head.target.position.set(0, 0, 25);
  player.car.group.add(head, head.target);
}
$('ten-chang').textContent = stage.name;
$('hud-chang').textContent = inJourney ? '🏍️ Chặng ' + (journey.leg + 1) + '/' + JOURNEY.legs.length + ': ' + stage.name : stage.name;
setupJourneyUI();
$('mo-ta-chang').textContent = stage.desc;
placeOnGrid();
showBest();
frame();

// Cho phép kiểm tra trạng thái game từ công cụ phát triển của trình duyệt
window.__game = {
  get state() { return state; }, get quality() { return quality; }, player, ais, track, obstacles, settings, startRace, toMenu, applyQuality,
  camera, scene, input, render, hazards, combat, police, get coins() { return coins; },
  // Chạy nhanh n bước (dùng khi kiểm thử tự động)
  step(n = 60, dt = STEP, draw = true) { for (let i = 0; i < n; i++) simulate(dt); present(dt); if (draw) render(); },
};
