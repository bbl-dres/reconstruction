import { cutawayRole } from './cutaway-classification.js';
// Bundeshaus compatibility rules. Keep model-specific assumptions out of the renderer.
export const LEVELS = {
  entrance: { label: 'South public entrance', elevation: -4.2, min: -4.9, max: 0.25 },
  lower: { label: 'Lower hall', elevation: 0, min: -0.5, max: 7.1 },
  principal: { label: 'Principal floor', elevation: 7.55, min: 7.1, max: 18.9 },
  upper: { label: 'Room 301', elevation: 19.35, min: 19.0, max: 30.8 },
};

// Top-floor presentation overrides use product IDs so all split components agree.
const topFloorHiddenProducts = new Set([
  'archive-floor-third-south-workplace',
  'archive-floor-third-offices',
  'archive-floor-second',
]);
const upperLunetteIvoryId = 'd008-a9f4d24d-1c1b-50d7-818f-2600165415ce';

export const WALK_STARTS = {
  // Seed the downward floor search above both the original and v023 raised hall.
  hall: { position: [5, 1.12, -8], target: [0, 4, 1], label: 'Dome hall' },
  national: { position: [0, 7.6, 13], target: [0, 9.2, 28], label: 'National Council' },
  states: { position: [0, 7.6, -15.3], target: [0, 9.2, -25], label: 'Council of States' },
};

function hasLegacyUpperCollection(mesh) {
  return (mesh.userData.viewer_source_collections || []).some(name => /^(?:07c|08c)\s*\|\s*Conference room 301\b/i.test(name));
}

export function belongsToUpperRoom(mesh) {
  // v012 repairs live in a shared corrections collection. Room membership must
  // survive collection reorganization without pulling other repairs upstairs.
  return (mesh.userData.viewer_room_ids || []).some(id => ['room-301', 'conference-room-301'].includes(id))
    || hasLegacyUpperCollection(mesh);
}

export function isPublicEntrance(mesh) {
  const data = mesh.userData;
  return (data.viewer_room_ids || []).some(id => ['south-public-lobby', 'south-public-arcade'].includes(id))
    || (data.viewer_source_collections || []).some(name => /^08[e-z]\s*\|\s*(?:South public entrance|Public entrance)\b/i.test(name));
}

export function isStaircaseSculpture(mesh) {
  // v001-v007 put this interior group in the shared sculpture collection and
  // consequently tag it as exterior. Keep the correction specific to this group.
  return /^Three Confederates (?:simplified sculpture|pedestal)\b/i.test(mesh.userData.viewer_source_name || mesh.name);
}

export function isConnectingGallery(mesh) {
  return mesh.userData.viewer_role === 'connector'
    || (mesh.userData.viewer_source_collections || []).some(name => name.startsWith('02b |'));
}

function isGalleryRoof(mesh) {
  const data = mesh.userData;
  const name = data.viewer_source_name || mesh.name;
  return ['roof', 'ceiling'].includes(data.viewer_role)
    || /^Connector\s+(?:NW|NE|SW|SE)\b.*\b(?:roof|attic|upper cornice|upper entablature)\b/i.test(name);
}

export function visibleInMode(mesh, mode, level = 'all', definitions = LEVELS) {
  const data = mesh.userData;
  if (data.viewer_role === 'collision') return false;
  if (mode === 'orbit' || mode === 'walk') return true;
  if (mode === 'dollhouse' && level === 'upper' && definitions !== LEVELS
      && (topFloorHiddenProducts.has(data.viewer_element_id) || data.viewer_id === upperLunetteIvoryId)) return false;
  const collections = data.viewer_source_collections || [];
  const gallery = isConnectingGallery(mesh);
  const cutaway = mode === 'dollhouse' ? cutawayRole(mesh) : undefined;
  if (cutaway === 'enclosure' || cutaway === 'overhead') return false;
  const authoredInterior = cutaway === 'interior';
  // 02b is a circulation assembly, despite v006+ tagging its columns, decks and
  // arches as removable exterior decoration. Keep its roof assembly separate.
  if (!authoredInterior && gallery && isGalleryRoof(mesh)) return false;
  // New envelope collections (e.g. 02d south facade) must leave with the shell,
  // including attached columns/trim whose exported cutaway flag is false.
  if (mode === 'dollhouse' && !authoredInterior && !gallery && collections.some(name => /^02[a-z]*\s*\|/i.test(name))) return false;
  // Removable ceilings include skylight glass and frames tagged as windows.
  if (mode === 'dollhouse' && !authoredInterior && (data.viewer_source_collections || []).some(name => name.startsWith('09 |'))) return false;
  const archiveLevels = definitions !== LEVELS;
  const upper = !archiveLevels && belongsToUpperRoom(mesh);
  if (!archiveLevels && level === 'upper' && !upper) return false;
  if (level !== 'all' && level !== 'upper' && upper) return false;
  const floorIds = data.viewer_floor_ids;
  const entrance = isPublicEntrance(mesh);
  if (!archiveLevels && level === 'entrance' && !entrance) return false;
  // Chamber galleries use "upper" in the author's storey vocabulary; the
  // viewer's Upper option means Room 301. Slice these galleries by actual height.
  const chamberGallery = (data.viewer_room_ids || []).includes('national-council')
    && /\bgaller(?:y|ies)\b/i.test(data.viewer_source_name || mesh.name)
    && Boolean(data.bounds);
  // Legacy gallery slabs are mislabeled 'lower' even at the principal datum.
  // Their prepared world bounds below remain authoritative for floor slicing.
  if (!archiveLevels && !gallery && !chamberGallery && !(entrance && level === 'entrance') && level !== 'all' && Array.isArray(floorIds) && floorIds.length && !floorIds.includes(level)) return false;
  const staircaseSculpture = isStaircaseSculpture(mesh);
  const sculptureCollection = (data.viewer_source_collections || []).some(name => name.startsWith('04 |'));
  // Exterior figures leave with the facade, even when a 'seated' figure was
  // misclassified as furniture. Interior artwork remains part of the cutaway.
  if (!authoredInterior && sculptureCollection && data.viewer_environment !== 'interior' && !staircaseSculpture) return false;
  if (mode === 'dollhouse' && !authoredInterior && (archiveLevels || level !== 'upper') && data.viewer_dollhouse_hidden && !staircaseSculpture && !gallery) return false;
  if (!authoredInterior && (['roof', 'ceiling'].includes(data.viewer_role) || (data.viewer_role === 'exterior-decoration' && !staircaseSculpture && !gallery))) return false;
  // Legacy Room 301 mixes its ceiling assembly with walls. New separately
  // authored fixtures use their explicit roles and remain in the cutaway.
  if (!authoredInterior && hasLegacyUpperCollection(mesh) && /ceiling|roof ribs|pendant|suspension/i.test(mesh.name)) return false;
  if (level !== 'all' && mesh.userData.bounds) {
    const bounds = mesh.userData.bounds;
    const section = definitions[level];
    if (!section || bounds.max.y < section.min || bounds.min.y > section.max) return false;
  }
  return true;
}

export function collisionCandidate(mesh) {
  if (mesh.userData.viewer_role === 'collision') return true;
  if (isConnectingGallery(mesh)) return !isGalleryRoof(mesh) && /(?:lower(?: service level)?|broad passage vault) piers|spandrels and soffits|structural deck|end pilasters|column.*shaft|enclosed upper wall (piers|sub-sill)/i.test(mesh.userData.viewer_source_name || mesh.name);
  if (mesh.userData.bounds?.min.y > 25) return false;
  // Authored floors can be named "deck" or "dais". Keep them as walking
  // surfaces even when the legacy name heuristic below does not recognize them.
  if (mesh.userData.viewer_role === 'floor') return true;
  // Structural surfaces and large obstacles only. No tiny ornament or rail spindles.
  if (/acanthus|capital|cornice|mould|joint|seam|voussoir|archivolt|baluster|runner|microphone|coffer|frame|mural|painting|inset|upholstery|leather|glazing/i.test(mesh.name)) return false;
  return /floor|ground|cross gallery|pavement|paving|stair|landing|wall|enclosure|partition|pier.*shaft|column.*shaft|plinth|seat|desk top|desktop|table|ceiling|facade.*pier|facade.*spandrel/i.test(mesh.name);
}
