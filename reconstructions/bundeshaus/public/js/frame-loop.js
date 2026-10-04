// One queued frame at most. Controls request frames until damping settles;
// walking returns true to continue simulation. Idle inspection schedules none.
export function createFrameLoop(draw, { request = requestAnimationFrame, cancel = cancelAnimationFrame } = {}) {
  let pending = null;
  let paused = false;
  let stopped = false;
  const invalidate = () => {
    if (!paused && !stopped && pending === null) pending = request(frame);
  };
  const clear = () => {
    if (pending !== null) cancel(pending);
    pending = null;
  };
  function frame(time) {
    pending = null;
    if (!paused && !stopped && draw(time)) invalidate();
  }
  return {
    invalidate,
    setPaused(value) { paused = value; if (paused) clear(); else invalidate(); },
    stop() { stopped = true; clear(); },
  };
}
