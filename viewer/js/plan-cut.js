import { Plane, Vector3 } from 'three';

// Floor plan's section: a plane above the level's floor and one below the level. Every building
// material carries these planes at all times; outside Floor plan they are parked far beyond any
// model, where they clip nothing. Entering or leaving Floor plan therefore changes two numbers and
// never the number of clipping planes, which is part of every shader program's key: a change there
// recompiles every material.
export const PARKED = 1e9;

export function createCutPlanes() {
  const planes = [new Plane(new Vector3(0, -1, 0), PARKED), new Plane(new Vector3(0, 1, 0), PARKED)];
  return {
    planes,
    // Keeps what lies between bottom and top (world heights in metres).
    cut(top, bottom) { planes[0].constant = top; planes[1].constant = -bottom; },
    park() { planes[0].constant = PARKED; planes[1].constant = PARKED; },
    get top() { return planes[0].constant; },
  };
}
