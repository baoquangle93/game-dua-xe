// Xe máy đua 3D có người lái (dựng bằng hình khối). Cả xe và người nghiêng vào khi vào cua.
import * as THREE from 'three';

const tireGeo = new THREE.TorusGeometry(0.36, 0.12, 10, 24).rotateY(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.07, 16).rotateZ(Math.PI / 2);
const spokeGeo = new THREE.BoxGeometry(0.08, 0.5, 0.06);

export function createBike(color, helmetColor) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const chassis = new THREE.Group(); // nghiêng cả xe lẫn người
  group.add(chassis);

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.75 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 1, roughness: 0.25 });
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const suitDark = new THREE.MeshStandardMaterial({ color: 0x23252d, roughness: 0.7 });
  const helmet = new THREE.MeshPhysicalMaterial({ color: helmetColor, metalness: 0.3, roughness: 0.25, clearcoat: 1 });
  const visor = new THREE.MeshPhysicalMaterial({ color: 0x0b1018, metalness: 0.9, roughness: 0.05 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 1.2 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c4, emissiveIntensity: 1.6 });

  const add = (geo, mat, x, y, z, parent = chassis, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };

  // Bánh xe (đầu xe hướng +z)
  const wheels = [];
  for (const [z, front] of [[0.82, true], [-0.78, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(0, 0.48, z); chassis.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    add(tireGeo, dark, 0, 0, 0, spin);
    add(rimGeo, chrome, 0, 0, 0, spin);
    for (let k = 0; k < 3; k++) add(spokeGeo, chrome, 0, 0, 0, spin, (k * Math.PI) / 3);
    wheels.push({ pivot, spin, front });
  }

  // Thân xe: yếm trước, bình xăng, yên, đuôi, ống xả, phuộc
  add(new THREE.BoxGeometry(0.42, 0.55, 0.7), paint, 0, 0.95, 0.62, chassis, -0.5);
  add(new THREE.BoxGeometry(0.3, 0.06, 0.32), visor, 0, 1.28, 0.78, chassis, -0.9); // kính chắn gió
  add(new THREE.BoxGeometry(0.46, 0.32, 0.6), paint, 0, 1.0, 0.1);
  add(new THREE.BoxGeometry(0.34, 0.36, 0.9), dark, 0, 0.66, -0.05); // máy
  add(new THREE.BoxGeometry(0.32, 0.1, 0.5), dark, 0, 1.08, -0.38); // yên
  add(new THREE.BoxGeometry(0.3, 0.22, 0.55), paint, 0, 1.1, -0.72, chassis, 0.25); // đuôi
  add(new THREE.BoxGeometry(0.22, 0.08, 0.05), tailMat, 0, 1.12, -1.0);
  add(new THREE.BoxGeometry(0.2, 0.12, 0.05), headMat, 0, 1.02, 1.0);
  add(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 10), chrome, 0.2, 0.62, -0.62, chassis, Math.PI / 2 - 0.25); // ống xả
  for (const x of [-0.13, 0.13]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6), chrome, x, 0.82, 0.74, chassis, -0.35); // phuộc
  add(new THREE.BoxGeometry(0.7, 0.05, 0.05), dark, 0, 1.18, 0.55); // tay lái

  // Người lái: cúi rạp người về phía trước
  add(new THREE.BoxGeometry(0.42, 0.6, 0.3), suit, 0, 1.38, -0.12, chassis, 1.05); // thân
  add(new THREE.BoxGeometry(0.4, 0.14, 0.32), suitDark, 0, 1.36, -0.12, chassis, 1.05); // sọc ngang
  for (const x of [-0.2, 0.2]) {
    add(new THREE.BoxGeometry(0.14, 0.14, 0.55), suit, x, 1.32, 0.26, chassis, 0.35); // tay vươn tới tay lái
    add(new THREE.BoxGeometry(0.16, 0.16, 0.6), suitDark, x * 1.15, 1.06, -0.22, chassis, 0.2); // đùi
    add(new THREE.BoxGeometry(0.14, 0.5, 0.16), suitDark, x * 1.2, 0.8, -0.42, chassis, 0.5); // cẳng chân
  }
  add(new THREE.SphereGeometry(0.21, 16, 12), helmet, 0, 1.6, 0.22);
  add(new THREE.BoxGeometry(0.3, 0.1, 0.12), visor, 0, 1.6, 0.4);

  return { group, chassis, wheels, tailMat };
}
