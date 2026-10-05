// Level choices for the level picker and Page Up / Page Down. No DOM or Three.js dependency.

// Highest level first, as in the model tree and in a building's section.
export function orderedLevels(ids, definitions) {
  return ids.filter(id => id !== 'all' && definitions[id])
    .sort((a, b) => definitions[b].elevation - definitions[a].elevation);
}

// One step up (+1) or down (-1) the picker's list: All levels sits above the top level,
// except in Floor plan, which always shows one. Stops at either end.
export function adjacentLevel(current, direction, ordered, plan = false) {
  const sequence = plan ? ordered : ['all', ...ordered];
  if (!sequence.length) return current;
  const index = sequence.indexOf(current);
  if (index < 0) return sequence[0];
  return sequence[Math.max(0, Math.min(sequence.length - 1, index - Math.sign(direction)))];
}
