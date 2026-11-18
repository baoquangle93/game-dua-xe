// Điều khiển: bàn phím + nút cảm ứng
export const input = { up: false, down: false, left: false, right: false, handbrake: false };

const MAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'handbrake',
};

export function setupInput() {
  addEventListener('keydown', (e) => {
    const k = MAP[e.code];
    if (k) { input[k] = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => {
    const k = MAP[e.code];
    if (k) { input[k] = false; e.preventDefault(); }
  });
  addEventListener('blur', () => { for (const k in input) input[k] = false; });

  document.querySelectorAll('[data-key]').forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => { e.preventDefault(); input[k] = true; btn.classList.add('an'); };
    const off = (e) => { e.preventDefault(); input[k] = false; btn.classList.remove('an'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}
