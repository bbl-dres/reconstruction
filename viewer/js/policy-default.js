// Default presentation policy for buildings authored to the model contract (docs/model-contract.md).
// It relies only on exported properties: viewer_cutaway_role, viewer_role, viewer_floor_ids and bounds.
// A building with legacy geometry can supply its own module with the same exports through the
// "building-policy" entry of its page's import map (see reconstructions/bundeshaus/public/policy/).
// Levels come from the catalog's levelDefinitions; no built-in floors.
export const LEVELS = {};

// Reference standing points for tests; the viewer starts walking below the camera. A legacy policy may still export its own.
export const WALK_STARTS = {};

const removedInDollhouse = new Set(['roof', 'ceiling']);
const walkingRoles = new Set(['collision', 'floor', 'exterior-wall', 'interior-wall', 'terrain', 'door']);

export function visibleInMode(mesh, mode, level = 'all', definitions = LEVELS) {
  const data = mesh.userData;
  if (data.viewer_role === 'collision') return false;
  if (mode === 'orbit' || mode === 'walk') return true;
  const cutaway = data.viewer_cutaway_role;
  if (mode === 'dollhouse' && (cutaway === 'enclosure' || cutaway === 'overhead')) return false;
  if (mode === 'dollhouse' && cutaway !== 'interior' && (data.viewer_dollhouse_hidden || removedInDollhouse.has(data.viewer_role))) return false;
  if (level === 'all') return true;
  const floors = data.viewer_floor_ids;
  if (Array.isArray(floors) && floors.length && !floors.includes(level)) return false;
  const section = definitions[level], bounds = data.bounds;
  if (section && bounds && (bounds.max.y < section.min || bounds.min.y > section.max)) return false;
  return true;
}

export function collisionCandidate(mesh) {
  return walkingRoles.has(mesh.userData.viewer_role)
    || ['stair', 'furniture'].includes(mesh.userData.viewer_role) && !/rail|baluster|cushion/i.test(mesh.name);
}
