// Tự vẽ hoạ tiết bằng canvas, không cần file ảnh bên ngoài
import * as THREE from 'three';

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function specks(g, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.fillRect(Math.random() * w, Math.random() * h, Math.random() * size + 0.6, Math.random() * size + 0.6);
  }
}

// Mặt đường nhựa: vạch trắng hai bên + vạch đứt giữa
export const makeAsphalt = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#44464b'; g.fillRect(0, 0, w, h);
  specks(g, w, h, 7000, ['#3a3c41', '#505359', '#4a4c51', '#5b5e65', '#36383c'], 2);
  g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(w * 0.22, 0, w * 0.12, h); g.fillRect(w * 0.66, 0, w * 0.12, h);
  g.fillStyle = '#ececec'; g.fillRect(9, 0, 6, h); g.fillRect(w - 15, 0, 6, h);
  g.fillStyle = '#f2f2f2'; g.fillRect(w / 2 - 3, 0, 6, h * 0.45);
});

export const makeGrass = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#557f33'; g.fillRect(0, 0, w, h);
  specks(g, w, h, 26000, ['#4a7330', '#5f8c3a', '#6b9842', '#46692b', '#7a9f45'], 3);
});

export const makeSand = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#c9a46c'; g.fillRect(0, 0, w, h);
  specks(g, w, h, 9000, ['#b8925c', '#d6b47e', '#a98552', '#e0c08c'], 2);
});

// Sọc hai màu chạy dọc theo đường (dùng cho bó vỉa và tường chắn)
export const makeStripes = (a, b) => canvasTex(16, 64, (g, w, h) => {
  g.fillStyle = a; g.fillRect(0, 0, w, h / 2);
  g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
});

export const makeChecker = (cols, rows) => canvasTex(cols * 16, rows * 16, (g) => {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    g.fillStyle = (r + c) % 2 ? '#111' : '#f5f5f5';
    g.fillRect(c * 16, r * 16, 16, 16);
  }
}, false);

export const makeBanner = (text) => canvasTex(1024, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#ef476f'); gr.addColorStop(1, '#ff9f1c');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = (x / 16) % 2 ? '#111' : '#fff';
    g.fillRect(x, 0, 16, 12); g.fillStyle = (x / 16) % 2 ? '#fff' : '#111'; g.fillRect(x, h - 12, 16, 12);
  }
  g.fillStyle = '#fff'; g.font = 'italic 900 64px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 8; g.fillText(text, w / 2, h / 2 + 2);
}, false);

// Ô tăng tốc: mũi tên vàng chạy về phía trước (có thể cuộn để tạo chuyển động)
export const makeBoost = () => canvasTex(128, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#ff7b00'); gr.addColorStop(0.5, '#ffb000'); gr.addColorStop(1, '#ff7b00');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff7c2';
  for (const y of [8, 72]) { // hình chữ V hướng xuống = hướng về phía trước
    g.beginPath();
    g.moveTo(14, y); g.lineTo(w / 2, y + 34); g.lineTo(w - 14, y);
    g.lineTo(w - 14, y + 18); g.lineTo(w / 2, y + 52); g.lineTo(14, y + 18);
    g.closePath(); g.fill();
  }
});

export const makeSmoke = () => canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, false);
