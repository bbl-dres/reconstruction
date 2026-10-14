import { modelScope } from './model-scope.js?v=site-1';

// The parts of a mesh's visibility that depend only on authored data: its model scope, and the
// building policy's answer for a view and level. Both are worked out once per mesh and remembered,
// so a mode or level change reads answers instead of re-running the policy's name and collection
// tests for every mesh. Meshes, their userData and the level definitions do not change after loading.
export function createVisibilityRules(meshes, visibleInMode, definitions) {
  const building = Uint8Array.from(meshes, mesh => modelScope(mesh) === 'building' ? 1 : 0);
  const answers = new Map();
  return {
    // visibleModelScope(): the building's own scope always shows; site and context follow the switch.
    inScope(index, surroundings, view) {
      return building[index] === 1 || (surroundings && view !== 'plan');
    },
    // visibleInMode() of the building policy, evaluated for every mesh on first use of a view and level.
    inMode(index, view, level) {
      const key = `${view}|${level}`;
      let list = answers.get(key);
      if (!list) {
        list = Uint8Array.from(meshes, mesh => visibleInMode(mesh, view, level, definitions) ? 1 : 0);
        answers.set(key, list);
      }
      return list[index] === 1;
    },
  };
}
