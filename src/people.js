// Người: khán giả (vẽ hàng trăm người bằng instancing), biết nhảy cổ vũ khi xe chạy ngang qua
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Tô một màu cho cả khối (màu này nhân với màu áo của từng người)
function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, arr = [];
  for (let i = 0; i < n; i++) arr.push(c.r, c.g, c.b);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

// Thân người cao khoảng 1.75: chân (quần tối màu), áo, tay (giơ lên hoặc buông xuống)
const legs = () => tint(new THREE.BoxGeometry(0.36, 0.82, 0.24).translate(0, 0.41, 0), 0x3a3f52);
const torso = () => tint(new THREE.BoxGeometry(0.48, 0.62, 0.28).translate(0, 1.13, 0), 0xffffff);
const bodyDown = mergeGeometries([
  legs(), torso(),
  tint(new THREE.BoxGeometry(0.13, 0.58, 0.15).translate(-0.31, 1.12, 0), 0xffffff),
  tint(new THREE.BoxGeometry(0.13, 0.58, 0.15).translate(0.31, 1.12, 0), 0xffffff),
]);
const bodyUp = mergeGeometries([
  legs(), torso(),
  tint(new THREE.BoxGeometry(0.13, 0.62, 0.15).translate(0, 0.31, 0).rotateZ(0.38).translate(-0.27, 1.38, 0), 0xffffff),
  tint(new THREE.BoxGeometry(0.13, 0.62, 0.15).translate(0, 0.31, 0).rotateZ(-0.38).translate(0.27, 1.38, 0), 0xffffff),
]);
const headGeo = new THREE.SphereGeometry(0.17, 10, 8).translate(0, 1.62, 0);
const hairGeo = new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, 1.65, -0.01);

const SHIRTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#ffffff', '#f78c6b', '#9b5de5', '#e63946', '#2ec4b6', '#ff9f1c'];
const SKINS = ['#f1c9a5', '#e0ac7e', '#c68b59', '#8d5a3b', '#f6d7bd'];
const HAIRS = ['#1b1410', '#3b2618', '#6b4426', '#111111', '#c9a227'];
const pick = (a) => a[(Math.random() * a.length) | 0];

export class Crowd {
  constructor() { this.list = []; this.t = 0; }

  // Thêm một người tại (x, y, z), mặt nhìn theo góc rotY. opt.amp = độ nhảy, opt.calm = đứng yên hơn
  add(x, y, z, rotY, opt = {}) {
    this.list.push({
      x, y, z, rotY, up: opt.up ?? Math.random() < 0.55,
      phase: Math.random() * Math.PI * 2, speed: 7 + Math.random() * 5,
      amp: opt.amp ?? 0.12 + Math.random() * 0.22, calm: opt.calm ?? false,
      s: 0.9 + Math.random() * 0.22, shirt: opt.shirt ?? pick(SHIRTS),
    });
  }

  build(scene) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const ups = this.list.filter((p) => p.up), downs = this.list.filter((p) => !p.up);
    const make = (geo, m, n) => {
      const mesh = new THREE.InstancedMesh(geo, m, Math.max(1, n));
      mesh.count = n; mesh.castShadow = true; mesh.frustumCulled = false;
      scene.add(mesh); return mesh;
    };
    this.meshUp = make(bodyUp, mat, ups.length);
    this.meshDown = make(bodyDown, mat, downs.length);
    this.heads = make(headGeo, skinMat, this.list.length);
    this.hair = make(hairGeo, skinMat, this.list.length);
    const col = new THREE.Color();
    ups.forEach((p, i) => { p.mesh = this.meshUp; p.i = i; });
    downs.forEach((p, i) => { p.mesh = this.meshDown; p.i = i; });
    this.list.forEach((p, i) => {
      p.mesh.setColorAt(p.i, col.set(p.shirt));
      this.heads.setColorAt(i, col.set(pick(SKINS)));
      this.hair.setColorAt(i, col.set(pick(HAIRS)));
    });
    this.dummy = new THREE.Object3D();
    this.update(0, null);
  }

  // Khán giả ở gần xe người chơi nhảy hăng hơn
  update(dt, focus) {
    this.t += dt;
    const d = this.dummy, t = this.t;
    this.list.forEach((p, i) => {
      let hype = p.calm ? 0.15 : 0.35;
      if (focus) {
        const dx = p.x - focus.x, dz = p.z - focus.z, d2 = dx * dx + dz * dz;
        if (d2 < 6400) hype = p.calm ? 0.5 : 1.2 - (d2 / 6400) * 0.6;
      }
      const jump = Math.abs(Math.sin(t * p.speed * 0.5 + p.phase)) * p.amp * hype;
      d.position.set(p.x, p.y + jump, p.z);
      d.rotation.set(0, p.rotY + Math.sin(t * 2 + p.phase) * 0.15 * hype, 0);
      d.scale.setScalar(p.s);
      d.updateMatrix();
      p.mesh.setMatrixAt(p.i, d.matrix);
      this.heads.setMatrixAt(i, d.matrix);
      this.hair.setMatrixAt(i, d.matrix);
    });
    for (const m of [this.meshUp, this.meshDown, this.heads, this.hair]) m.instanceMatrix.needsUpdate = true;
  }
}

// Một người cầm cờ caro đứng cạnh vạch xuất phát, vẫy cờ liên tục
export function createFlagman(checkerTex) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac7e, roughness: 0.7 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.6 });
  const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  add(new THREE.BoxGeometry(0.4, 0.85, 0.26), pants, 0, 0.43, 0);
  add(new THREE.BoxGeometry(0.5, 0.65, 0.3), shirt, 0, 1.18, 0);
  add(new THREE.SphereGeometry(0.18, 12, 10), skin, 0, 1.68, 0);
  add(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 12), cap, 0, 1.82, 0);
  add(new THREE.BoxGeometry(0.14, 0.6, 0.15), shirt, -0.32, 1.15, 0);
  // Cánh tay cầm cờ: xoay quanh vai
  const arm = new THREE.Group(); arm.position.set(0.32, 1.42, 0); g.add(arm);
  add(new THREE.BoxGeometry(0.14, 0.6, 0.15), shirt, 0, 0.28, 0, arm);
  add(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 }), 0, 1.15, 0, arm);
  const flag = add(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshStandardMaterial({ map: checkerTex, side: THREE.DoubleSide, roughness: 0.7 }), 0, 1.45, 0.56, arm);
  flag.rotation.y = Math.PI / 2;
  let t = 0;
  return {
    group: g,
    update(dt, excited) {
      t += dt * (excited ? 9 : 3);
      arm.rotation.x = Math.sin(t) * (excited ? 0.9 : 0.35);
      arm.rotation.z = 0.25 + Math.sin(t * 0.5) * 0.1;
    },
  };
}
