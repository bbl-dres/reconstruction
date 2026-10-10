// Model ownership is independent of element category and storey. A site wall or
// stair belongs to the site model, even when delivered alongside the building.
export function modelScope(mesh) {
  for (let node = mesh; node; node = node.parent) {
    const data = node.userData || {};
    if (['building', 'site', 'surroundings'].includes(data.viewer_model_scope)) return data.viewer_model_scope;
    const collections = data.viewer_source_collections || [];
    if (collections.some(name => name === 'Building_Site' || name.startsWith('Building_Site_'))) return 'site';
    if (collections.some(name => name === 'Context' || name.startsWith('Context_'))) return 'surroundings';
  }
  return 'building';
}

export function visibleModelScope(mesh, surroundingsEnabled, mode) {
  return modelScope(mesh) === 'building' || (surroundingsEnabled && mode !== 'plan');
}
