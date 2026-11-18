// Mẫu xe đua 3D dựng bằng hình khối (không dùng mô hình của game nào khác)
import * as THREE from 'three';

// Dựng thân xe từ hình cắt ngang bên hông (z, y), kéo dày theo bề ngang xe
function extrudeProfile(pts, depth, bevel) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);      // hình cắt nằm dọc theo trục z (đầu xe hướng +z)
  g.translate(depth / 2, 0, 0); // căn giữa theo bề ngang
  return g;
}

const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 24).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.36, 12).rotateZ(Math.PI / 2);
const spokeA = new THREE.BoxGeometry(0.37, 0.5, 0.07);
const spokeB = new THREE.BoxGeometry(0.37, 0.07, 0.5);

export function createCar(color) {
  const group = new THREE.Group();
  const chassis = new THREE.Group(); // phần thân, nghiêng khi vào cua / phanh
  group.add(chassis);

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1420, metalness: 0.9, roughness: 0.05, clearcoat: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 1, roughness: 0.22 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 1.2 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c4, emissiveIntensity: 1.6 });

  const add = (geo, mat, x = 0, y = 0, z = 0, parent = chassis) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };

  const W = 1.9;
  // Thân xe
  add(extrudeProfile([[-2.25, 0.32], [2.15, 0.32], [2.3, 0.55], [2.2, 0.78], [0.95, 0.98], [0.25, 1.42], [-0.95, 1.48], [-1.75, 1.06], [-2.3, 1.02]], W, 0.07), paint);
  // Kính (nhô nhẹ ra ngoài thân) và mui xe cùng màu sơn
  add(extrudeProfile([[0.95, 0.98], [0.25, 1.42], [-0.95, 1.48], [-1.75, 1.06]], W, 0.1), glass);
  add(extrudeProfile([[0.05, 1.36], [0.27, 1.43], [-0.95, 1.49], [-1.2, 1.37]], W - 0.24, 0.12), paint);
  // Ốp sườn, lưới tản nhiệt, đèn
  add(new THREE.BoxGeometry(W + 0.2, 0.16, 3.9), dark, 0, 0.34, 0);
  add(new THREE.BoxGeometry(1.15, 0.16, 0.06), dark, 0, 0.46, 2.34);
  for (const x of [-0.62, 0.62]) {
    add(new THREE.BoxGeometry(0.5, 0.13, 0.08), headMat, x, 0.66, 2.33);
    add(new THREE.BoxGeometry(0.55, 0.14, 0.06), tailMat, x, 0.88, -2.38);
    add(new THREE.BoxGeometry(0.06, 0.3, 0.2), dark, x, 1.18, -2.05);
  }
  // Cánh gió sau
  add(new THREE.BoxGeometry(1.95, 0.06, 0.45), paint, 0, 1.34, -2.05);
  // Sọc trắng trên mui
  add(new THREE.BoxGeometry(0.32, 0.02, 1.05), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), 0, 1.53, -0.35);

  // Bánh xe (không gắn vào chassis để không nghiêng theo thân)
  const wheels = [];
  for (const [x, z, front] of [[1.0, 1.38, true], [-1.0, 1.38, true], [1.0, -1.38, false], [-1.0, -1.38, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.42, z); group.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    add(tireGeo, dark, 0, 0, 0, spin);
    add(rimGeo, chrome, 0, 0, 0, spin);
    add(spokeA, chrome, 0, 0, 0, spin);
    add(spokeB, chrome, 0, 0, 0, spin);
    wheels.push({ pivot, spin, front });
  }

  return { group, chassis, wheels, tailMat };
}
