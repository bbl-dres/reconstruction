import { Euler, MathUtils } from 'three';

const look = new Euler(0, 0, 0, 'YXZ');
export function turnView(camera, dx, dy) {
  look.setFromQuaternion(camera.quaternion, 'YXZ');
  look.y -= dx * 0.004;
  look.x = MathUtils.clamp(look.x - dy * 0.004, -Math.PI / 2 + 0.08, Math.PI / 2 - 0.08);
  camera.quaternion.setFromEuler(look);
}

// Separate pointer IDs allow moving and looking with two fingers at once.
export function wireTouchWalk({ canvas, buttons, camera, keys, invalidate }) {
  let active = false;
  let drag = null;
  const held = new Map();
  const release = id => {
    const entry = held.get(id);
    if (!entry) return;
    held.delete(id);
    if (![...held.values()].some(value => value.key === entry.key)) {
      keys.delete(entry.key); entry.button.classList.remove('held');
    }
  };
  const reset = () => {
    for (const [id, { button }] of [...held]) {
      release(id);
      if (typeof id === 'number' && button.hasPointerCapture(id)) button.releasePointerCapture(id);
    }
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
  };
  for (const button of buttons) {
    const key = button.dataset.walkKey;
    button.addEventListener('pointerdown', event => {
      if (!active || event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      held.set(event.pointerId, { key, button }); keys.add(key); button.classList.add('held');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => release(event.pointerId));
    button.addEventListener('keydown', event => {
      if (!active || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      held.set(button, { key, button }); keys.add(key); button.classList.add('held');
    });
    button.addEventListener('keyup', event => {
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); release(button); }
    });
    button.addEventListener('blur', () => release(button));
    button.addEventListener('contextmenu', event => { if (active) event.preventDefault(); });
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || drag || event.button !== 0) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', event => {
    if (!active || drag?.id !== event.pointerId) return;
    turnView(camera, event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX; drag.y = event.clientY; invalidate();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (drag?.id === event.pointerId) drag = null; });
  canvas.addEventListener('contextmenu', event => { if (active) event.preventDefault(); });
  return { setActive(value) { reset(); active = value; }, reset };
}
