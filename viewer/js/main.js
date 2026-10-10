import * as THREE from 'three';
import { loadGLB, paintOpportunity, prepareStaticModel, disposeAsset } from './asset-loader.js?v=gzip-6';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LEVELS, visibleInMode, collisionCandidate } from 'building-policy';
import { building } from './building-config.js';
import { Walker, combineWorlds } from './walking.js?v=ground-1';
import { prepareCollisionWorld } from './collision-loader.js?v=terrain-2';
import { restoreView, navigateView, settle, toPlan, fromPlan, copyPerspective, eyeLevelFov, fitDistance } from './view-navigation.js?v=fit-1';
import { readViewURL, writeViewURL, defaultPlanLevel } from './view-url.js?v=plan-1';
import { materialsOf } from './scene-utils.js?v=1';
import { createRenderInstances } from './render-instances.js?v=sync-2';
import { wirePanelTabs, wireDropdowns, wireSidebar, wireResponsiveLayout, wireLanguageMenu, closeDropdowns, dropdownOpen, openDropdown, setRangeDescription } from './interface.js?v=app-tools-3';
import { t, formatNumber, onLanguageChange } from './i18n.js?v=i18n-2';
import { createSurroundingsStyle } from './surroundings-style.js?v=alpha-1';
import { parseMetadata, describeElement } from './model-metadata.js?v=archive-levels-1';
import { wirePicking, highlightElement, highlightElements } from './inspection.js?v=clip-2';
import { parseBimRegistry, describeProduct } from './bim-registry.js?v=redesign-1';
import { parseCatalog, chooseModel } from './model-catalog.js?v=archive-levels-1';
import { Daylight } from './daylight.js?v=fit-1';
import { STUDIO, studioSunDirection, applyStudioLights, createSkyEnvironment } from './lighting.js?v=sky-ibl-1';
import { localParts, dayOfYear, calendarSelection, calendarDate } from './solar-time.js?v=calendar-2';
import { renderBudget, calloutPlacement } from './view-layout.js?v=redesign-1';
import { wireTouchWalk } from './touch-walk.js';
import { createFrameLoop } from './frame-loop.js';
import { fitDirectionalShadow, shadowCoverage } from './shadow-fit.js?v=fit-1';
import { buildModelTree, filterTree, hiddenBy, hiddenMeshes, ancestors, elementsUnder, humanize, cleanName } from './model-tree.js?v=redesign-1';
import { visibleModelScope } from './model-scope.js?v=site-1';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const navButtons = [...document.querySelectorAll('[data-nav]')];
const keys = new Set();
// mode is the camera mode; walkView is what Walk and Fly show (Exterior or Dollhouse visibility).
// walking: Walk or Fly is moving the walking camera, looking by drag, with the pad on touch screens.
const state = { mode: 'orbit', level: 'all', planLevel: null, ready: false, presented: false, dirty: true, meshes: [], materials: new Set(), walker: null, collision: null, terrain: null, walkPreparing: false, walking: false, walkView: 'orbit', navIntent: 'walk', modeRequest: 0, previousTime: 0, noticeTimer: 0, noticeOwner: null, metadata: 'loading' };
let renderer, scene, camera, perspective, walkCamera, orthographic, orbit, plan, sun, fillLight, model, daylight, environmentTarget;
let frameLoop;
let buildingInstances;
let shadowScope = 'building';
let shadowDirty = true;
let buildingBounds = new THREE.Box3();
let casterBounds = new THREE.Box3();
let viewportSize = '';
let collisionPromise = null;
let terrainPromise = null;
const collisionAbort = new AbortController();
const assetAbort = new AbortController();
// Floor plan cuts 1 m above the chosen level's floor, as a drawn floor plan does, and below that floor.
const PLAN_CUT = 1;
// Cut through, furniture, stairs and other things that stand in a room leave odd fragments: in Floor
// plan they are drawn whole when they start below the cut. Walls, columns, doors and windows are cut,
// which shows the openings; what hangs above the cut (chandeliers, cornices) stays cut away.
const PLAN_WHOLE = new Set(['furniture', 'chair', 'desk', 'table', 'cabinet', 'bench',
  'stair', 'balustrade', 'railing', 'handrail', 'guardrail',
  'sculpture', 'plant', 'equipment', 'decoration', 'light-fixture']);
const wholeInPlan = (mesh, cut) => PLAN_WHOLE.has(mesh.userData.viewer_category ?? mesh.userData.viewer_role)
  && (mesh.userData.bounds?.min.y ?? Infinity) < cut;
// Clipping belongs to materials, which elements share: whole objects draw with unclipped copies.
const uncutMaterials = new Map();
const cutMaterialOf = new Map();
const uncut = material => {
  if (!uncutMaterials.has(material)) uncutMaterials.set(material, Object.assign(material.clone(), { clippingPlanes: null }));
  return uncutMaterials.get(material);
};
const cutPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 100), new THREE.Plane(new THREE.Vector3(0, 1, 0), 100)];
const orbitDirection = new THREE.Vector3(0.95, 1.1, -1.35).normalize();
let urlTimer = 0;
const surroundings = { root: null, bounds: null, style: null, instances: null, prepared: false, materials: new Set(), loading: false, progress: null, phase: 'download', error: '' };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const touchPrimary = matchMedia('(pointer: coarse)');
let touchWalk;
let metadata = { views: [], pointsOfInterest: [], objects: new Map() };
let bim = null;
let clearHighlight = null;
let selectedElement = null;
let inspectorAnchor = null;
let pendingSiteView = false;
let daylightMinutes = 720;
const config = building();
const modelBase = new URL(config.models, config.baseUrl);
let activeModel = null;
let activeLevels = LEVELS;
const diagnostics = new URL(location.href).searchParams.has('stats');
// Model tree: hidden and isolated hold node IDs; hiddenMeshes is derived from them.
const TREE_PAGE = 50, TREE_ROWS = 500;
const tree = { model: null, loading: true, expanded: new Set(), collapsedInFilter: new Set(), hidden: new Set(), isolated: null, filter: null, shown: new Map(), active: null, hiddenMeshes: new Set() };
const QUALITIES = ['auto', 'high', 'low'];
const qualityInputs = [...document.querySelectorAll('[name="render-quality"]')];
const renderQuality = () => qualityInputs.find(input => input.checked)?.value || 'auto';
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = id => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
// Imported models are static: render instancing batches repeated meshes unless ?instances=0.
const useInstances = new URL(location.href).searchParams.get('instances') !== '0';
// Width over height of the 3D view, never zero or infinite while the stage is collapsed.
const viewAspect = () => Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
// Status lines are live regions: rewriting the same text would announce it again.
function setText(id, text) {
  const element = $(id);
  if (element.textContent !== text) element.textContent = text;
}

// Walk mode moves on foot or in flight; announcements name whichever is active.
function modeName(mode) {
  return mode === 'walk' ? t(state.navIntent === 'fly' ? 'nav.fly' : 'nav.walk') : t(`mode.${mode}`);
}

// The loading card keeps how to produce its text, so a language change re-renders it.
const loadingText = { title: () => t('loading.opening'), detail: () => t('loading.finding') };
function showLoading(part, text) {
  loadingText[part] = text;
  const element = $(`loading-${part}`), value = text();
  if (element.textContent !== value) element.textContent = value;
}

function renderScene() {
  if (diagnostics) renderer.info.reset();
  const start = diagnostics ? performance.now() : 0;
  renderer.render(scene, camera);
  if (diagnostics) {
    let output = $('render-stats');
    if (!output) {
      output = document.createElement('p');
      output.id = 'render-stats'; output.className = 'model-stats';
      $('model-stats').after(output);
    }
    output.textContent = `${state.mode} · ${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles} submitted triangles · ${(performance.now() - start).toFixed(1)} ms CPU submission · DPR ${renderer.getPixelRatio().toFixed(2)}`;
  }
}

// A blocked storage API must never stop the viewer from opening.
function readPreference(key, fallback) {
  try {
    const value = localStorage.getItem(`building-viewer:${key}`);
    return value === null ? fallback : value === 'true';
  } catch { return fallback; }
}
function storePreference(key, value) {
  try { localStorage.setItem(`building-viewer:${key}`, String(value)); } catch { /* Private browsing may block storage. */ }
}
$('surroundings').checked = readPreference('surroundings', true);
$('muted-surroundings').checked = readPreference('muted-surroundings', true);
try {
  const quality = localStorage.getItem('building-viewer:quality');
  if (QUALITIES.includes(quality)) qualityInputs.find(input => input.value === quality).checked = true;
} catch { /* Use automatic quality when storage is unavailable. */ }

// Errors meant for the visitor carry a translation key; anything else is described by its kind.
// The technical message goes to the console only.
function errorKey(error) {
  if (error?.key) return error.key;
  if (error?.name === 'TypeError' || /fetch|load failed|network|404|not found|HTTP/i.test(error?.message || '')) return 'error.buildingFile';
  return 'error.model';
}
const keyedError = (key, cause) => Object.assign(new Error(key, { cause }), { key });

function setViewerControlsEnabled(enabled) {
  for (const button of [...modeButtons, ...navButtons]) button.disabled = !enabled;
  for (const id of ['reset', 'zoom-in', 'zoom-out', 'lighting-toggle', 'copy-view-link']) $(id).disabled = !enabled;
}

function showError(error) {
  console.error(error);
  state.ready = false;
  state.presented = false;
  assetAbort.abort(error);
  collisionAbort.abort(error);
  frameLoop?.stop();
  setViewerControlsEnabled(false);
  closeDropdowns();
  closeInspector();
  stopWalking();
  $('camera-tools').hidden = true;
  $('loading').hidden = false;
  showLoading('title', () => t('error.title'));
  const key = errorKey(error);
  showLoading('detail', () => t(key));
  $('load-progress').hidden = true;
  $('retry').hidden = false;
}

function invalidate() {
  state.dirty = true; frameLoop?.invalidate();
  if (state.ready && !urlTimer) urlTimer = setTimeout(syncViewURL, 300);
}

function currentViewLink() {
  const target = state.mode === 'walk' ? camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(camera.position)
    : (state.mode === 'plan' ? plan : orbit).target;
  return writeViewURL(location.href, { version: activeModel.id, mode: state.mode, nav: state.walker?.flying ? 'fly' : 'walk', level: state.level,
    position: camera.position.toArray(), target: target.toArray(), zoom: camera.zoom,
    halfHeight: orthographic.top, orbit: orbitDirection.toArray(),
    surroundings: $('surroundings').checked, muted: $('muted-surroundings').checked });
}

function syncViewURL() {
  clearTimeout(urlTimer); urlTimer = 0;
  if (!state.ready) return;
  const url = currentViewLink();
  // Replace, rather than push, so camera drags don't fill browser history.
  if (url.href !== location.href) try { history.replaceState(history.state, '', url); } catch { /* Copy link still works. */ }
}

// A link's switches apply before the building and surroundings load, so the surroundings
// arrive with the link's look; its camera follows once the building is there.
function applyLinkSettings(view) {
  if (!view) return;
  if (view.surroundings !== undefined) $('surroundings').checked = view.surroundings;
  if (view.muted !== undefined) $('muted-surroundings').checked = view.muted;
}

// The camera and controls that serve a mode.
function useCameraFor(mode) {
  camera = mode === 'plan' ? orthographic : mode === 'walk' ? walkCamera : perspective;
  orbit.enabled = mode === 'orbit' || mode === 'dollhouse';
  plan.enabled = mode === 'plan';
}

function restoreLink(view) {
  if (!view) return null;
  state.mode = view.mode; state.level = view.level;
  if (view.mode === 'walk') state.navIntent = view.nav;
  useCameraFor(view.mode);
  if (view.orbit) orbitDirection.fromArray(view.orbit).normalize();
  if (!view.snapshot) return false;
  const saved = { ...view.snapshot, position: new THREE.Vector3().fromArray(view.snapshot.position), target: new THREE.Vector3().fromArray(view.snapshot.target) };
  if (view.mode === 'walk') {
    // Walk always uses the eye-level lens, including links saved with an older zoom.
    camera.position.copy(saved.position); camera.lookAt(saved.target); camera.zoom = 1; camera.updateProjectionMatrix();
  } else {
    orbit.maxDistance = Math.max(orbit.maxDistance, saved.position.distanceTo(saved.target) * 1.1);
    if (view.mode === 'plan') { saved.position.x = saved.target.x; saved.position.z = saved.target.z; saved.position.y = Math.max(saved.target.y + 150, saved.position.y); }
    restoreView(saved, camera, view.mode === 'plan' ? plan : orbit, viewAspect());
  }
  camera.far = Math.max(camera.far, saved.position.distanceTo(saved.target) * 2);
  camera.updateProjectionMatrix();
  return true;
}
function notify(message, duration = 5500, owner = null) {
  clearTimeout(state.noticeTimer);
  state.noticeOwner = owner;
  $('notice').textContent = message;
  $('notice').hidden = false;
  state.noticeTimer = setTimeout(() => { $('notice').hidden = true; }, duration);
}
function clearNotice(owner) {
  if (state.noticeOwner === owner) $('notice').hidden = true;
}

function initialize() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: touchPrimary.matches ? 'default' : 'high-performance' });
  } catch (error) { throw keyedError('error.webgl', error); }
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = STUDIO.toneMapping;
  renderer.toneMappingExposure = STUDIO.exposure;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;
  renderer.info.autoReset = !diagnostics;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  // Outdoor sky as image-based light (viewer/js/lighting.js): contrast without shadow maps.
  environmentTarget = createSkyEnvironment(renderer);
  scene.environment = environmentTarget.texture;
  fillLight = new THREE.HemisphereLight();
  scene.add(fillLight);
  sun = new THREE.DirectionalLight();
  applyStudioLights({ scene, sun, fillLight });
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 260 });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.00008;
  sun.target.position.set(0, 10, 0);
  scene.add(sun, sun.target);
  setStudioSun();
  daylight = new Daylight({ scene, sun, fillLight, renderer, bounds: shadowBounds });
  // Fresh visits always start in studio lighting (sun and sky, shadows off), even if the browser restores forms.
  resetLightingControls();
  perspective = new THREE.PerspectiveCamera(45, 1, 0.08, 1500);
  // A separate walking camera preserves the visitor's position AND heading.
  walkCamera = new THREE.PerspectiveCamera(60, 1, 0.08, 1500);
  orthographic = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  // Screen up points towards the model's north facade, not a claimed true north.
  orthographic.up.set(0, 0, -1);
  camera = perspective;
  orbit = new OrbitControls(perspective, canvas);
  orbit.enableDamping = !reducedMotion.matches;
  orbit.dampingFactor = 0.09;
  orbit.minDistance = 2;
  orbit.maxDistance = 450;
  orbit.maxPolarAngle = Math.PI - 0.01;
  orbit.addEventListener('change', invalidate);
  orbit.addEventListener('start', () => { pendingSiteView = false; });
  plan = new OrbitControls(orthographic, canvas);
  plan.enableRotate = false;
  plan.enableDamping = !reducedMotion.matches;
  plan.screenSpacePanning = true;
  plan.minZoom = 0.4;
  plan.maxZoom = 12;
  plan.mouseButtons.LEFT = THREE.MOUSE.PAN;
  plan.touches.ONE = THREE.TOUCH.PAN;
  plan.enabled = false;
  plan.addEventListener('change', invalidate);
  resize();
  frameLoop = createFrameLoop(render);
  frameLoop.setPaused(document.hidden);
  invalidate();
  wireControls();
  loadCatalog();
}

async function loadCatalog() {
  try {
    const response = await fetch(new URL('catalog.json', modelBase), { signal: assetAbort.signal });
    if (!response.ok) throw keyedError('error.catalog');
    let models;
    try { models = parseCatalog(await response.json()); } catch (error) { throw keyedError('error.catalog', error); }
    const requested = new URL(location.href).searchParams.get('version');
    activeModel = chooseModel(models, requested);
    activeLevels = activeModel.levelDefinitions || LEVELS;
    $('model-version').textContent = activeModel.label;
    $('daylight').disabled = !activeModel.location;
    // Today's date in the building's own time zone.
    resetLightingDate();
    document.title = t('app.title', { version: activeModel.label });
    showLoading('title', () => t('loading.openingVersion', { version: activeModel.label }));
    // Levels are usable as soon as the building is; elements follow with the registry.
    buildTree(null, []);
    if (requested && activeModel.id !== requested) notify(t('loading.versionGone', { version: activeModel.label }));
    loadMetadata();
    loadModel();
  } catch (error) { if (!assetAbort.signal.aborted) showError(error); }
}

async function loadModel() {
  let pendingRoot;
  try {
    const signal = assetAbort.signal;
    // The building and its surroundings load together and appear together, unless a shared link
    // turns the surroundings off or opens the floor plan, which hides them.
    const link = readViewURL(location.href, activeModel.levels);
    applyLinkSettings(link);
    const withSurroundings = $('surroundings').checked && link?.mode !== 'plan';
    const downloads = withSurroundings ? { building: {}, surroundings: {} } : { building: {} };
    // One bar for both: their bytes together once both sizes are known.
    const showDownload = () => {
      if (signal.aborted) return;
      const parts = Object.values(downloads);
      const downloading = parts.some(part => part.phase !== 'decode');
      const total = parts.reduce((sum, part) => sum + (part.total || 0), 0);
      const loaded = parts.reduce((sum, part) => sum + (part.loaded || 0), 0);
      const known = downloading && parts.every(part => part.total);
      const percent = known ? Math.min(99, Math.floor(loaded / total * 100)) : null;
      if (percent === null) $('load-progress').removeAttribute('value');
      else $('load-progress').value = percent;
      showLoading('detail', () => !downloading ? t('loading.decoding') : !known ? t('loading.starting')
        : t(withSurroundings ? 'loading.downloadingAll' : 'loading.downloading',
          { percent: percent === 99 ? 99 : Math.floor(percent / 5) * 5, size: formatNumber(total / 1_000_000, 1) }));
    };
    const context = withSurroundings ? loadSurroundings(progress => { Object.assign(downloads.surroundings, progress); showDownload(); }) : null;
    const gltf = await loadGLB(new URL(activeModel.building, modelBase), { signal, onProgress: progress => {
      Object.assign(downloads.building, progress);
      showDownload();
    } });
    pendingRoot = gltf.scene;
    showLoading('detail', () => t('loading.preparing'));
    await paintOpportunity(signal);
    let triangles = 0;
    const { meshes, materials } = await prepareAsset(pendingRoot, signal, mesh => {
      mesh.name = mesh.userData.viewer_source_name || mesh.name.replaceAll('_', ' ');
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      for (const material of materialsOf(mesh)) material.clipShadows = true;
    });
    model = pendingRoot;
    state.meshes = meshes;
    state.materials = materials;
    scene.add(model);
    if (useInstances) buildingInstances = createRenderInstances(meshes, scene);
    $('model-stats').textContent = `${state.meshes.length} meshes · ${Math.round(triangles / 1000)}k triangles · ${activeModel.label}`;
    $('model-stats').hidden = !diagnostics;
    const linkRestored = restoreLink(link);
    applyVisibility();
    if (!linkRestored) {
      if (state.mode === 'walk') {
        camera = perspective; frameView(); copyPerspective(perspective, walkCamera, { matchLens: false }); camera = walkCamera;
      } else frameView();
    }
    renderer.shadowMap.needsUpdate = true;
    updateShadowFraming();
    // Compile with the final lighting/clipping configuration. The normal frame
    // loop waits until this first presentation, keeping the loading state true.
    await renderer.compileAsync(scene, camera);
    signal.throwIfAborted();
    // Show both at once. Surroundings that fail leave the building to open on its own, and so
    // does turning them off while they still load.
    if (context) {
      if (downloads.surroundings.phase === 'decode') showLoading('detail', () => t('surroundings.preparing'));
      let optOut;
      const optedOut = new Promise(resolve => { optOut = () => { if (!$('surroundings').checked) resolve(); }; });
      $('surroundings').addEventListener('change', optOut);
      await Promise.race([context, optedOut]);
      $('surroundings').removeEventListener('change', optOut);
      signal.throwIfAborted();
    }
    pendingRoot = null;
    state.ready = true;
    state.presented = true;
    refreshSurroundings();
    renderScene();
    $('loading').hidden = true;
    renderPlaces();
    loadBim();
    setViewerControlsEnabled(true);
    // Also loads surroundings that a link opened without, once they are switched on.
    updateInterface();
    if (state.mode === 'walk') prepareWalk(++state.modeRequest);
    $('announcer').textContent = t('loading.ready', { version: activeModel.label, mode: modeName(state.mode) });
    invalidate();
  } catch (error) {
    buildingInstances?.dispose(); buildingInstances = null;
    disposeAsset(pendingRoot);
    if (!assetAbort.signal.aborted) showError(error);
  }
}

// What the scene shows: Walk and Fly keep the Exterior or Dollhouse visibility they started from.
function displayMode() { return state.mode === 'walk' ? state.walkView : state.mode; }

// The chosen level is a filter in every view: only elements assigned to it in the model
// tree stay visible, whatever their height. Until the tree has its elements, the building
// policy's level ranges stand in. Floor plan also cuts at the cut height above the level.
function inLevel(mesh) {
  return state.level === 'all' || tree.loading || tree.model?.elementOf.get(mesh)?.level === state.level;
}

// Floor plan cuts 1 m above the chosen level's floor and below that level.
function updateCutPlanes() {
  const section = activeLevels[state.level];
  const clip = Boolean(section && displayMode() === 'plan');
  if (clip) {
    cutPlanes[0].constant = section.elevation + PLAN_CUT;
    cutPlanes[1].constant = -section.min;
  }
  return clip;
}

function applyVisibility() {
  const view = displayMode();
  const clip = updateCutPlanes();
  const policyLevel = tree.loading ? state.level : 'all';
  for (const mesh of state.meshes) {
    mesh.visible = visibleModelScope(mesh, $('surroundings').checked, view)
      && visibleInMode(mesh, view, policyLevel, activeLevels) && inLevel(mesh) && !tree.hiddenMeshes.has(mesh);
    const whole = clip && mesh.visible && wholeInPlan(mesh, cutPlanes[0].constant);
    if (whole && !cutMaterialOf.has(mesh)) {
      cutMaterialOf.set(mesh, mesh.material);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(uncut) : uncut(mesh.material);
    } else if (!whole && cutMaterialOf.has(mesh)) {
      mesh.material = cutMaterialOf.get(mesh);
      cutMaterialOf.delete(mesh);
    }
  }
  buildingInstances?.sync();
  for (const material of state.materials) {
    const wasClipped = Boolean(material.clippingPlanes?.length);
    material.clippingPlanes = clip ? cutPlanes : null;
    if (wasClipped !== clip) material.needsUpdate = true;
  }
  refreshShadowBounds();
  if ($('daylight').checked) updateDaylight();
  else applyLightingAppearance();
  renderer.shadowMap.needsUpdate = true;
  invalidate();
}

function refreshSurroundings() {
  const enabled = $('surroundings').checked;
  const visible = enabled && state.mode !== 'plan';
  if (surroundings.root) {
    const display = visible && surroundings.prepared;
    const changed = surroundings.root.visible !== display;
    surroundings.root.visible = display;
    if (changed) {
      surroundings.instances?.sync();
      refreshShadowBounds();
      renderer.shadowMap.needsUpdate = true;
      invalidate();
    }
  }
  // Building_Site can be packaged in the architectural GLB. Apply the same
  // visibility switch to its separate authored scope and resync linked instances.
  if (state.ready) applyVisibility();
  $('retry-surroundings').hidden = !surroundings.error;
  setText('surroundings-status', surroundings.error ? t('surroundings.unavailable')
    : enabled && state.mode === 'plan' ? t('surroundings.pausedInPlan')
      : enabled && surroundings.loading ? (surroundings.phase !== 'download' ? t('surroundings.preparing') : surroundings.progress === null ? t('surroundings.starting') : t('surroundings.downloading', { percent: surroundings.progress }))
        : t('surroundings.planHides'));
  $('muted-row').classList.toggle('dimmed', !enabled);
  $('surroundings-toggle').classList.toggle('surroundings-hidden', !enabled);
}

function updateSurroundings() {
  refreshSurroundings();
  // Turned on after opening, the surroundings load on their own. One in-flight request is reused across toggles.
  if (assetAbort.signal.aborted || !state.ready || !state.presented || !$('surroundings').checked || state.mode === 'plan' || surroundings.root || surroundings.loading) return;
  loadSurroundings();
}

// Downloads and prepares the surroundings. The promise settles once they are ready or have
// failed; onProgress follows the download for the loading card.
function loadSurroundings(onProgress = () => {}) {
  surroundings.loading = true;
  surroundings.progress = null;
  surroundings.phase = 'download';
  surroundings.error = '';
  refreshSurroundings();
  let pendingRoot;
  const signal = assetAbort.signal;
  return loadGLB(new URL(activeModel.surroundings, modelBase), { signal, onProgress: progress => {
    if (signal.aborted) return;
    surroundings.progress = progress.percent;
    surroundings.phase = progress.phase;
    onProgress(progress);
    refreshSurroundings();
  } }).then(async gltf => {
    const root = gltf.scene;
    pendingRoot = root;
    // The export shares the building's original origin, scale and orientation.
    root.visible = false;
    const { meshes, materials } = await prepareAsset(root, signal);
    for (const material of materials) surroundings.materials.add(material);
    const style = createSurroundingsStyle(root);
    if (useInstances) surroundings.instances = createRenderInstances(meshes, scene);
    style.setMuted($('muted-surroundings').checked);
    surroundings.instances?.sync();
    const bounds = new THREE.Box3().setFromObject(root);
    scene.add(root);
    surroundings.root = root;
    surroundings.style = style;
    for (const material of surroundings.style.materials) surroundings.materials.add(material);
    surroundings.bounds = bounds;
    const diameter = surroundings.bounds.getSize(new THREE.Vector3()).length();
    orbit.maxDistance = Math.max(orbit.maxDistance, diameter * 4);
    perspective.far = Math.max(perspective.far, diameter * 6);
    perspective.updateProjectionMatrix();
    walkCamera.far = perspective.far;
    walkCamera.updateProjectionMatrix();
    // Precompile the optional asset against the viewer's lights before showing it.
    // compileAsync traverses invisible roots too; no hidden asset is rendered.
    await renderer.compileAsync(root, camera, scene);
    if (surroundings.instances) await renderer.compileAsync(surroundings.instances.root, camera, scene);
    signal.throwIfAborted();
    surroundings.prepared = true;
    pendingRoot = null;
    // Walking surfaces in preparation or in use: the terrain joins them.
    if (collisionPromise) prepareTerrain();
    // Site bookmarks requested before this asset loaded need visible bounds.
    refreshSurroundings();
    if (pendingSiteView && $('surroundings').checked && state.mode === 'orbit') frameView(true);
    pendingSiteView = false;
    // Loaded with the building, they are announced with it.
    if (state.presented && $('surroundings').checked && state.mode !== 'plan') $('announcer').textContent = t('surroundings.ready');
  }).catch(error => {
    disposeSurroundings();
    disposeAsset(pendingRoot);
    if (signal.aborted) return;
    pendingSiteView = false;
    console.error('Surroundings could not be loaded:', error);
    surroundings.error = 'unavailable';
    if ($('surroundings').checked) notify(t('surroundings.failed'));
    $('surroundings').checked = false;
  }).finally(() => {
    surroundings.loading = false;
    // Respect the current checkbox and mode even if they changed during loading.
    if (!signal.aborted) refreshSurroundings();
  });
}

function disposeSurroundings() {
  surroundings.instances?.dispose(); surroundings.instances = null;
  surroundings.style?.setMuted(false);
  surroundings.style?.dispose(); surroundings.style = null;
  disposeAsset(surroundings.root);
  surroundings.root = null;
  surroundings.prepared = false;
  surroundings.materials.clear();
}

// Static preparation shared by the building and the surroundings: merged primitives,
// sharp textures at grazing angles, and the set of materials in use.
async function prepareAsset(root, signal, onMesh = () => {}) {
  const materials = new Set();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const meshes = await prepareStaticModel(root, { signal, onMesh: mesh => {
    for (const material of materialsOf(mesh)) {
      materials.add(material);
      if (material.map) material.map.anisotropy = anisotropy;
    }
    onMesh(mesh);
  } });
  signal.throwIfAborted();
  return { meshes, materials };
}

function visibleBounds(includeSurroundings = false) {
  const bounds = new THREE.Box3();
  for (const mesh of state.meshes) if (mesh.visible) bounds.union(mesh.userData.bounds);
  if (bounds.isEmpty()) return new THREE.Box3(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 30, 30));
  const section = activeLevels[state.level];
  if (section && displayMode() === 'plan') {
    bounds.min.y = section.min;
    bounds.max.y = section.elevation + PLAN_CUT;
  }
  if (includeSurroundings && surroundings.root?.visible) bounds.union(surroundings.bounds);
  return bounds;
}

function refreshShadowBounds() {
  buildingBounds = visibleBounds();
  casterBounds = visibleBounds(true);
  shadowDirty = true;
}

function shadowBounds() {
  const scope = shadowCoverage({ building: buildingBounds, site: surroundings.root?.visible ? surroundings.bounds : null,
    camera, target: state.mode === 'walk' ? camera.position : state.mode === 'plan' ? plan.target : orbit.target, previous: shadowScope });
  if (scope !== shadowScope) { shadowScope = scope; shadowDirty = true; }
  return { receivers: scope === 'site' ? casterBounds : buildingBounds, casters: casterBounds };
}

function updateShadowFraming() {
  if (!state.meshes.length || !renderer.shadowMap.enabled || !sun.castShadow || sun.intensity <= 0) return;
  const bounds = shadowBounds();
  if (!shadowDirty) return;
  fitDirectionalShadow(sun, bounds.receivers, bounds.casters);
  renderer.shadowMap.needsUpdate = true;
  shadowDirty = false;
}

function frameView(includeSurroundings = false) {
  // Stop drag momentum before fitting a new floor or the wider site.
  settle(state.mode === 'plan' ? plan : orbit);
  const bounds = visibleBounds(includeSurroundings);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  if (state.mode === 'plan') {
    orthographic.position.set(center.x, bounds.max.y + 150, center.z);
    plan.target.copy(center);
    // fit to both viewport dimensions, allowing room for the floating controls
    const aspect = viewAspect();
    const height = Math.max(size.z * 1.25, size.x / aspect * 1.25, 20);
    orthographic.left = -height * aspect / 2;
    orthographic.right = height * aspect / 2;
    orthographic.top = height / 2;
    orthographic.bottom = -height / 2;
    orthographic.zoom = 1;
    orthographic.updateProjectionMatrix();
    plan.update();
  } else {
    const distance = fitDistance(perspective, size.length() / 2) * (state.mode === 'dollhouse' ? 1.03 : 1.06);
    const direction = new THREE.Vector3(0.95, state.mode === 'dollhouse' ? 1.1 : 0.65, -1.35).normalize();
    perspective.position.copy(center).addScaledVector(direction, distance);
    orbit.target.copy(center);
    orbit.update();
  }
  invalidate();
}

// Frame one element or group from the current viewing direction.
function frameBounds(bounds) {
  if (bounds.isEmpty()) return;
  pendingSiteView = false;
  const control = state.mode === 'plan' ? plan : orbit;
  settle(control);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  if (state.mode === 'plan') {
    const shift = new THREE.Vector3(center.x - plan.target.x, 0, center.z - plan.target.z);
    plan.target.add(shift); orthographic.position.add(shift);
    const aspect = viewAspect();
    const height = Math.max(size.z * 1.6, size.x / aspect * 1.6, 2);
    orthographic.zoom = THREE.MathUtils.clamp((orthographic.top - orthographic.bottom) / height, plan.minZoom, plan.maxZoom);
    orthographic.updateProjectionMatrix();
    plan.update();
  } else {
    const distance = THREE.MathUtils.clamp(fitDistance(perspective, Math.max(size.length() / 2, 0.5)) * 1.2, orbit.minDistance, orbit.maxDistance);
    const direction = perspective.position.clone().sub(orbit.target).normalize();
    orbit.target.copy(center);
    perspective.position.copy(center).addScaledVector(direction, distance);
    orbit.update();
  }
  invalidate();
}

async function setMode(mode) {
  if (!state.ready || mode === state.mode) return;
  const request = ++state.modeRequest;
  pendingSiteView = false;
  const previous = state.mode;
  const aspect = viewAspect();
  if (previous !== 'walk') settle(previous === 'plan' ? plan : orbit);
  stopWalking();
  // Leaving Walk or Fly while its surfaces are still being prepared drops that notice.
  if (previous === 'walk') clearNotice('walk.preparing');
  if (previous === 'walk') {
    settle(orbit);
    // Each camera keeps its own lens: eye level on foot, the 45° orbit lens otherwise.
    copyPerspective(walkCamera, perspective, { matchLens: false });
    orbit.target.copy(walkCamera.position).addScaledVector(walkCamera.getWorldDirection(new THREE.Vector3()), 10);
    orbit.update();
  } else if (previous === 'plan') {
    fromPlan(orthographic, plan.target, orbitDirection, perspective, orbit, aspect);
  }
  if (mode === 'plan') {
    orbitDirection.copy(perspective.position).sub(orbit.target).normalize();
    toPlan(perspective, orbit.target, orthographic, plan, aspect, buildingBounds.max.y + 150);
  } else if (mode === 'walk') {
    copyPerspective(perspective, walkCamera, { matchLens: false });
    state.walkView = previous === 'dollhouse' ? 'dollhouse' : 'orbit';
  }
  state.mode = mode;
  keys.clear();
  useCameraFor(mode);
  // Plan needs one floor. A floor plan picks it for the visitor, so leaving the plan shows all levels again.
  if (previous === 'plan' && state.planLevel === state.level) state.level = 'all';
  state.planLevel = null;
  if (mode === 'plan' && state.level === 'all') state.level = state.planLevel = defaultPlanLevel(activeModel?.levels);
  applyVisibility();
  // Floor plan opens on its whole level, wherever the orbit camera had been panned or zoomed.
  if (mode === 'plan') frameView();
  updateInterface();
  if (mode === 'walk') {
    await prepareWalk(request);
    if (!isCurrentWalk(request)) return;
  }
  $('announcer').textContent = modeName(mode) + (state.level !== 'all' ? ` · ${levelLabel()}` : '');
  invalidate();
}

// The view dock. On foot, Exterior and Dollhouse change what is shown without leaving Walk or Fly.
function chooseView(view) {
  if (!state.ready) return;
  if (state.mode === 'walk' && view !== 'plan') {
    if (state.walkView === view) return;
    state.walkView = view;
    applyVisibility();
    updateInterface();
    $('announcer').textContent = `${modeName(view)} · ${modeName('walk')}`;
    return;
  }
  setMode(view);
}

// Orbit, Fly or Walk, switched on the fly. Fly and Walk share the walking camera and
// start at once; Fly ignores collisions.
async function chooseNavigation(nav) {
  if (!state.ready) return;
  if (nav === 'orbit') {
    if (state.mode === 'walk') await setMode(state.walkView);
    return;
  }
  state.navIntent = nav;
  if (state.mode !== 'walk') { await setMode('walk'); return; }
  // Still preparing, or failed: (re)start the preparation, which applies the choice when done.
  if (!state.walker || state.walkPreparing) { updateNavButtons(); prepareWalk(++state.modeRequest); return; }
  applyNavigation();
  startWalking();
  updateInterface();
}

// Walk drops straight down from the camera; with nothing at all below, it keeps flying.
function applyNavigation() {
  const walker = state.walker;
  if (state.navIntent === 'fly') walker.setFlying(true);
  else if (walker.flying && !walker.dropBelow()) state.navIntent = 'fly';
}

// The surroundings' terrain is walked on too, once they are loaded. Their buildings are context only.
function prepareTerrain() {
  if (terrainPromise || !surroundings.prepared) return terrainPromise || Promise.resolve();
  const meshes = new Set();
  // A terrain node with several materials is a group: its meshes carry the role on the group.
  surroundings.root.traverse(node => { if (node.userData.viewer_role === 'terrain') node.traverse(mesh => { if (mesh.isMesh) meshes.add(mesh); }); });
  terrainPromise = prepareCollisionWorld(meshes, collisionAbort.signal, undefined, { upward: true }).then(result => {
    state.terrain = result.world;
    joinWalkingWorlds();
  }).catch(error => {
    terrainPromise = null;
    if (!collisionAbort.signal.aborted) console.error('Terrain walking surfaces could not be prepared:', error);
  });
  return terrainPromise;
}

function joinWalkingWorlds() {
  if (state.walker) state.walker.world = state.terrain ? combineWorlds([state.collision.world, state.terrain]) : state.collision.world;
}

// Changing modes or choosing again during preparation must never start a stale walk.
const isCurrentWalk = request => state.mode === 'walk' && request === state.modeRequest && state.ready;

async function prepareWalk(request) {
  closeDropdowns();
  if (!state.collision || (surroundings.prepared && !state.terrain)) {
    notify(t('walk.preparing'), 60000, 'walk.preparing');
    state.walkPreparing = true;
    try {
      collisionPromise ||= prepareCollisionWorld(state.meshes, collisionAbort.signal, collisionCandidate).then(result => {
        state.collision = result;
        state.walker = new Walker(walkCamera, result.world);
      }).catch(error => { collisionPromise = null; throw error; });
      await Promise.all([collisionPromise, prepareTerrain()]);
      joinWalkingWorlds();
    } catch (error) {
      if (!isCurrentWalk(request)) return;
      console.error(error);
      notify(t('walk.failed'));
      return;
    } finally {
      // Every request waits on the same preparation, so it is over for all of them.
      state.walkPreparing = false;
      clearNotice('walk.preparing');
    }
  }
  if (!isCurrentWalk(request)) return;
  // Preserve this camera, including shared links. Walking from a viewpoint above the
  // floor drops straight down from it; flying starts here.
  state.walker.adoptView();
  applyNavigation();
  updateInterface();
  startWalking();
  invalidate();
}

function startWalking() {
  if (state.walker?.hasPosition) setWalkingActive(true);
}

function navigationHint() {
  if (state.mode === 'plan') return t(touchPrimary.matches ? 'nav.planHintTouch' : 'nav.planHint');
  if (state.mode === 'walk') return t(state.walker?.flying ? 'nav.flyHint' : 'nav.walkHint');
  return t(touchPrimary.matches ? 'nav.orbitHintTouch' : 'nav.orbitHint');
}

function levelLabel() {
  return state.level === 'all' ? t('level.all') : activeLevels[state.level]?.label || humanize(state.level);
}

function updateNavButtons() {
  const nav = state.mode !== 'walk' ? 'orbit' : state.walker ? (state.walker.flying ? 'fly' : 'walk') : state.navIntent;
  for (const button of navButtons) button.setAttribute('aria-pressed', String(button.dataset.nav === nav));
}

function updateInterface() {
  const mode = state.mode;
  const view = displayMode();
  $('viewer').dataset.viewMode = mode;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === view));
  $('navigation-hint').textContent = navigationHint();
  $('sheet-level').textContent = levelLabel();
  canvas.setAttribute('aria-label', t(mode === 'plan' ? 'canvas.plan' : mode === 'walk' ? 'canvas.walk' : 'canvas.orbit'));
  $('canvas-help').textContent = t(mode === 'walk' ? 'canvas.helpWalk' : mode === 'plan' ? 'canvas.helpPlan' : 'canvas.help');
  updateNavButtons();
  updateZoomButtons();
  updateWalkPad();
  updateSurroundings();
  updateDaylight();
  renderTree();
}

function isWalking() { return state.walking; }

// Walk and Fly look by dragging the view, with any pointer; touch screens add the movement pad.
// Every other control stays in view, so the visitor can switch at any time.
function setWalkingActive(active) {
  state.walking = active;
  const pad = active && touchPrimary.matches;
  touchWalk?.setActive(active);
  keys.clear();
  if (state.walker) state.walker.velocity.set(0, 0, 0);
  $('touch-walk').hidden = !pad;
  document.body.classList.toggle('touch-walking', pad);
  // Movement keys go to the view, so it takes focus whenever Walk or Fly starts.
  if (active) canvas.focus({ preventScroll: true });
  state.previousTime = performance.now();
  updateWalkPad();
  updateNavButtons();
  invalidate();
}

function stopWalking() {
  if (state.walking) setWalkingActive(false);
  keys.clear();
}

// Losing focus or turning the screen must not leave a movement key held.
function releaseMovement() {
  keys.clear();
  touchWalk?.reset();
}

function updateWalkPad() {
  const flying = state.walker ? state.walker.flying : state.navIntent === 'fly';
  $('touch-jump').hidden = flying;
  $('touch-fly').hidden = !flying;
}

function setStudioSun() {
  sun.target.position.set(0, 10, 0);
  sun.position.copy(sun.target.position).addScaledVector(studioSunDirection(), STUDIO.sun.distance);
  shadowDirty = true;
  renderer.shadowMap.needsUpdate = true;
  invalidate();
}

function setDaylightDate(year, day) {
  $('daylight-date').value = calendarDate(year, day);
}

// Today, in the building's time zone once the model is known.
function resetLightingDate() {
  const today = localParts(new Date(), activeModel?.location?.timeZone);
  setDaylightDate(today.year, dayOfYear(today));
  daylightMinutes = 720;
}

// Studio lighting: no daylight, default shadows and brightness, today at noon.
function resetLightingControls() {
  $('daylight').checked = false;
  $('shadows').checked = STUDIO.shadows;
  $('brightness').value = String(STUDIO.exposure);
  resetLightingDate();
}

function showBrightness() {
  const value = Number($('brightness').value);
  $('brightness-value').textContent = formatNumber(value, 1);
  setRangeDescription($('brightness'), t('lighting.brightnessValue', { value: Math.round(value * 100) }));
}

function updateAboutFacts() {
  const sky = $('daylight').checked && activeModel?.location;
  $('about-lighting').textContent = `${t(sky ? 'lighting.sunAndSky' : 'lighting.studioShort')} · ${t($('shadows').checked ? 'about.shadowsOn' : 'about.shadowsOff')}`;
  $('about-quality').textContent = t(`quality.${renderQuality()}`);
}

function applyLightingAppearance() {
  // Brightness and shadows apply to studio and daylight alike; Floor plan stays shadow-free for legibility.
  renderer.toneMappingExposure = Number($('brightness').value);
  showBrightness();
  const shadows = $('shadows').checked && state.mode !== 'plan';
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    for (const material of [...state.materials, ...uncutMaterials.values(), ...surroundings.materials]) material.needsUpdate = true;
    renderer.shadowMap.needsUpdate = shadows;
    shadowDirty = true;
  }
  updateAboutFacts();
  invalidate();
}

// Sunrise and sunset in 24-hour local time; one formatter per time zone.
const sunClocks = new Map();
function sunClock(timeZone) {
  if (!sunClocks.has(timeZone)) sunClocks.set(timeZone, new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }));
  return sunClocks.get(timeZone);
}

function updateDaylight() {
  if (!daylight) return;
  const location = activeModel?.location;
  const enabled = Boolean($('daylight').checked && location);
  $('lighting-toggle').classList.toggle('daylight-active', enabled);
  $('lighting-state').textContent = t(enabled ? 'lighting.daylightOn' : 'lighting.studio');
  $('daylight-options').hidden = !enabled;
  $('daylight-description').hidden = Boolean(location) || !activeModel;
  applyLightingAppearance();
  if (!enabled) {
    daylight.update({ enabled: false });
    setStudioSun();
    return;
  }
  const selection = calendarSelection($('daylight-date').value);
  $('daylight-date').setAttribute('aria-invalid', String(!selection));
  if (!selection) {
    setText('daylight-status', t('lighting.invalidDate'));
    $('daylight-status').hidden = false;
    return; // Leave the rendered sun unchanged while a date is incomplete.
  }
  const { year, day } = selection;
  setDaylightDate(year, day);
  const result = daylight.update({ enabled, showSky: state.mode !== 'plan', year, day, minutes: daylightMinutes, location });
  const actual = localParts(result.date, location.timeZone);
  // The skipped spring hour is visibly advanced to a real local time.
  if (result.adjusted) daylightMinutes = actual.hour * 60 + actual.minute;
  $('daylight-hour').value = `${String(actual.hour).padStart(2, '0')}:${String(actual.minute).padStart(2, '0')}`;
  const clock = sunClock(location.timeZone);
  const eventTime = value => value && Number.isFinite(value.getTime()) ? clock.format(value) : t('lighting.noEvent');
  setText('daylight-sun-times', t('lighting.sunTimes', { sunrise: eventTime(result.times.sunrise), sunset: eventTime(result.times.sunset) }));
  const notes = [];
  if (result.adjusted) notes.push(t('lighting.springForward'));
  if (result.repeated) notes.push(t('lighting.autumnRepeat'));
  if (state.mode === 'plan') notes.push(t('lighting.skyHiddenInPlan'));
  setText('daylight-status', notes.join(' '));
  $('daylight-status').hidden = notes.length === 0;
  invalidate();
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const budget = renderBudget({ width, height, dpr: devicePixelRatio, touch: touchPrimary.matches, quality: renderQuality() });
  const size = `${width}:${height}:${budget.pixelRatio}:${budget.shadowSize}:${budget.transmissionScale}`;
  if (size === viewportSize) return;
  viewportSize = size;
  renderer.setPixelRatio(budget.pixelRatio);
  renderer.transmissionResolutionScale = budget.transmissionScale;
  if (sun.shadow.mapSize.x !== budget.shadowSize) {
    sun.shadow.mapSize.set(budget.shadowSize, budget.shadowSize);
    sun.shadow.map?.dispose(); sun.shadow.map = null;
    shadowDirty = true;
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.setSize(width, height, false);
  perspective.aspect = width / height;
  perspective.updateProjectionMatrix();
  walkCamera.aspect = width / height;
  walkCamera.fov = eyeLevelFov(width / height);
  walkCamera.updateProjectionMatrix();
  const halfHeight = orthographic.top;
  orthographic.left = -halfHeight * width / height;
  orthographic.right = halfHeight * width / height;
  orthographic.updateProjectionMatrix();
  invalidate();
}

// Home: fit the building. Fly and Walk return to Orbit in the same view first.
async function resetView() {
  if (!state.ready) return;
  pendingSiteView = false;
  if (state.mode === 'walk') await setMode(state.walkView);
  if (state.mode !== 'walk') frameView();
}

// The camera rail's zoom: closer in Orbit and Floor plan; on foot, a narrower lens for a
// closer look, never wider than the eye-level view.
function zoomView(factor) {
  if (!state.ready) return;
  if (state.mode === 'walk') {
    walkCamera.zoom = THREE.MathUtils.clamp(walkCamera.zoom / factor, 1, 4);
    walkCamera.updateProjectionMatrix();
    updateZoomButtons();
    invalidate();
  } else navigate({ zoom: factor });
}

function updateZoomButtons() {
  $('zoom-out').disabled = !state.ready || (state.mode === 'walk' && walkCamera.zoom <= 1);
  $('zoom-in').disabled = !state.ready || (state.mode === 'walk' && walkCamera.zoom >= 4);
}

// + and - by the character typed, so every keyboard layout zooms; the numpad by its keys.
function zoomKey(event) {
  if (event.code === 'NumpadAdd') return 0.8;
  if (event.code === 'NumpadSubtract') return 1.25;
  return { '+': 0.8, '=': 0.8, '-': 1.25, '_': 1.25 }[event.key] ?? null;
}

function showFullscreenLabel() {
  $('fullscreen').querySelector('span').textContent = t(document.fullscreenElement ? 'menu.exitFullscreen' : 'menu.fullscreen');
}

// The static markup is already translated; this redraws everything the viewer writes itself.
function refreshLanguage() {
  if (activeModel) document.title = t('app.title', { version: activeModel.label });
  showLoading('title', loadingText.title);
  showLoading('detail', loadingText.detail);
  showFullscreenLabel();
  if (renderer) applyLightingAppearance();
  else showBrightness();
  renderPlaces();
  if (selectedElement) renderElementInfo(selectedElement);
  if (state.ready) updateInterface();
  $('announcer').textContent = `${t('language.label')}: ${t('language.name')}`;
}

function navigate(action) {
  if (!state.ready || state.mode === 'walk') return;
  navigateView(camera, state.mode === 'plan' ? plan : orbit, action);
  invalidate();
}

// Choosing a level filters the model to it without changing the view. Choosing it again
// shows all levels, except in Floor plan, which always shows one.
function chooseLevel(level) {
  if (!state.ready) return;
  if (state.level === level && displayMode() !== 'plan') level = 'all';
  setLevel(level);
}

function setLevel(level) {
  state.level = level;
  state.planLevel = null;
  applyVisibility();
  if (state.mode !== 'walk') {
    const control = state.mode === 'plan' ? plan : orbit;
    settle(control);
    const elevation = activeLevels[level]?.elevation;
    if (elevation !== undefined) {
      const shift = elevation - control.target.y;
      control.target.y += shift; camera.position.y += shift; control.update();
    }
  }
  updateInterface();
  $('announcer').textContent = `${levelLabel()} · ${modeName(displayMode())}`;
}

async function loadMetadata() {
  try {
    const response = await fetch(new URL(activeModel.metadata, modelBase), { signal: assetAbort.signal });
    if (!response.ok) throw new Error(`Metadata request failed: ${response.status}`);
    const data = await response.json();
    if (data.modelId !== activeModel.id) throw new Error('Metadata belongs to a different model version.');
    metadata = parseMetadata(data, activeModel.levels);
    for (const issue of metadata.issues) console.warn(issue);
    state.metadata = 'ready';
    renderPlaces();
    if (selectedElement) renderElementInfo(selectedElement);
  } catch (error) {
    if (assetAbort.signal.aborted) return;
    console.warn('Model annotations unavailable:', error);
    state.metadata = 'failed';
    renderPlaces();
  }
}

async function loadBim() {
  if (!activeModel.bim) { buildTree(null); return; }
  try {
    const response = await fetch(new URL(activeModel.bim, modelBase), { signal: assetAbort.signal });
    if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
    const loaded = parseBimRegistry(await response.json(), state.meshes, activeModel);
    assetAbort.signal.throwIfAborted();
    // A late optional registry must not silently change a selection already open.
    closeInspector();
    buildTree(loaded);
    bim = loaded;
  } catch (error) {
    if (assetAbort.signal.aborted) return;
    console.warn('Whole-object inventory unavailable:', error);
    bim = null;
    buildTree(null);
  }
}

function elementDescription(mesh) { return describeProduct(mesh, bim) || describeElement(mesh, metadata); }

// Properties are matched by label, case aside.
const findProperty = (properties, label) => properties.find(p => p.label.toLowerCase() === label.toLowerCase());
const selectedNode = () => selectedElement && tree.model?.elementOf.get(selectedElement);

function fallbackCategory(mesh) {
  const value = findProperty(describeElement(mesh, metadata).properties, 'category')?.value || 'unclassified';
  return value.toLowerCase().replace(/\s*\/\s*|\s+/g, '-');
}

// ── Places ──

function renderPlaces() {
  const groups = [[t('places.views'), metadata.views], [t('places.points'), metadata.pointsOfInterest]].filter(([, entries]) => entries.length);
  $('places-note').hidden = groups.length > 0;
  if (!groups.length) setText('places-note', t(state.metadata === 'failed' ? 'places.unavailable' : state.metadata === 'loading' || !state.ready ? 'places.loading' : 'places.none'));
  const items = [];
  for (const [title, entries] of groups) {
    if (groups.length > 1) {
      const heading = document.createElement('h3');
      heading.className = 'eyebrow places-heading'; heading.textContent = title;
      items.push(heading);
    }
    for (const entry of entries) {
      const button = document.createElement('button');
      button.className = 'place-row';
      button.innerHTML = `${icon({ orbit: 'i-cube', dollhouse: 'i-dollhouse', plan: 'i-plan' }[entry.camera.mode])}<span>${escapeHTML(entry.title)}</span>`;
      if (entry.description) button.title = entry.description;
      button.disabled = !state.ready;
      button.addEventListener('click', () => visitPlace(entry));
      items.push(button);
    }
  }
  $('places-list').replaceChildren(...items);
}

async function visitPlace(entry) {
  if (!state.ready) return;
  dismissSidebar();
  pendingSiteView = false;
  const view = entry.camera;
  await setMode(view.mode);
  state.level = view.level || 'all';
  state.planLevel = null;
  applyVisibility();
  updateInterface();
  if (view.frame === 'site') {
    $('surroundings').checked = true;
    storePreference('surroundings', true);
    pendingSiteView = !surroundings.prepared;
    updateSurroundings();
    if (surroundings.prepared) frameView(true);
    else notify(t('places.waitingForSite'));
  } else if (view.frame) frameView();
  else {
    const control = state.mode === 'plan' ? plan : orbit;
    const saved = {
      position: new THREE.Vector3().fromArray(view.position), target: new THREE.Vector3().fromArray(view.target),
      zoom: 1, halfHeight: view.height / 2,
    };
    restoreView(saved, camera, control, viewAspect());
  }
  $('announcer').textContent = `${entry.title} · ${modeName(state.mode)}`;
  invalidate();
}

// ── Model tree ──

function buildTree(registry, meshes = state.meshes) {
  const levels = (activeModel?.levels || []).filter(level => level !== 'all' && activeLevels[level]);
  const hidden = [...tree.hidden], isolated = tree.isolated;
  tree.model = buildModelTree({ meshes, bim: registry, levels, definitions: activeLevels, category: fallbackCategory });
  tree.loading = meshes.length === 0;
  for (const set of [tree.expanded, tree.collapsedInFilter, tree.hidden]) set.clear();
  tree.shown.clear(); tree.active = null;
  // Storey IDs stay the same when the registry replaces the first tree: keep what was hidden or isolated.
  for (const id of hidden) if (tree.model.nodes.has(id)) tree.hidden.add(id);
  tree.isolated = tree.model.nodes.has(isolated) ? isolated : null;
  tree.hiddenMeshes = hiddenMeshes(tree.model, tree.hidden, isolatedNode());
  tree.filter = filterTree(tree.model, $('tree-filter').value);
  if (!tree.loading) applyVisibility();
  renderTree();
}

const isolatedNode = () => tree.isolated ? tree.model.nodes.get(tree.isolated) : null;
const storeyOf = node => node.kind === 'storey' ? node : ancestors(node).at(-1);
const categoryOf = node => node.kind === 'category' ? node : ancestors(node).find(parent => parent.kind === 'category');

function isOpen(node) {
  if (!node.children.length) return false;
  if (tree.filter?.open.has(node)) return !tree.collapsedInFilter.has(node.id);
  return tree.expanded.has(node.id);
}

function renderTree() {
  const list = $('model-tree');
  if (!tree.model) return;
  const filter = tree.filter, isolated = isolatedNode();
  const selected = selectedElement ? tree.model.elementOf.get(selectedElement) : null;
  const rows = [];
  let truncated = false;
  const rowMarkup = (node, depth, open) => {
    const by = hiddenBy(node, tree.hidden, isolated);
    // The chosen level stays marked in every view.
    const focus = node.kind === 'storey' && state.level === node.level;
    const pinned = by || tree.isolated === node.id;
    const classes = ['tree-row', `is-${node.kind}`, node === selected && 'selected', focus && 'focus', by && 'is-hidden', pinned && 'pinned'].filter(Boolean).join(' ');
    const name = escapeHTML(node.name), say = (key, params) => escapeHTML(t(key, params));
    const labelState = node.kind === 'storey' ? ` aria-pressed="${focus}"` : node.kind === 'element' ? '' : ` aria-expanded="${open}"`;
    const hideTitle = by && by !== node ? (by === isolated ? say('tree.hiddenByIsolation') : say('tree.hiddenWith', { name: by.name })) : say('tree.showOrHide');
    // The Hide button's label says what it does next (Show or Hide); a pressed state would repeat it.
    return `<li class="${classes}" data-id="${escapeHTML(node.id)}" data-open="${open}" style="--depth:${depth}">`
      + `<button class="tree-chevron${node.children.length ? '' : ' empty'}" data-action="toggle" tabindex="-1" aria-label="${say(open ? 'tree.collapse' : 'tree.expand', { name: node.name })}">${icon('i-chevron')}</button>`
      + `<button class="tree-label" data-action="select" tabindex="-1" title="${name}"${labelState}><span class="tree-name">${name}</span></button>`
      + `<span class="tree-actions">`
      + `<button data-action="zoom" tabindex="-1" aria-label="${say('tree.zoomTo', { name: node.name })}" title="${say('tree.zoomTitle')}">${icon('i-full')}</button>`
      + `<button data-action="isolate" tabindex="-1" aria-pressed="${tree.isolated === node.id}" aria-label="${say('tree.isolate', { name: node.name })}" title="${say('tree.isolateTitle')}">${icon('i-isolate')}</button>`
      + `<button data-action="hide" tabindex="-1" aria-label="${say(by ? 'tree.show' : 'tree.hide', { name: node.name })}" title="${hideTitle}">${icon(by ? 'i-eye-off' : 'i-eye')}</button>`
      + `</span></li>`;
  };
  const visit = (node, depth, showAll) => {
    if (rows.length >= TREE_ROWS) { truncated = true; return; }
    const open = isOpen(node);
    rows.push(rowMarkup(node, depth, open));
    if (!open) return;
    // A match the visitor opens lists all of its contents; otherwise only the path to matches.
    const all = showAll || !filter || !filter.open.has(node);
    const limit = tree.shown.get(node.id) || TREE_PAGE;
    let count = 0;
    for (const child of node.children) {
      if (!all && !filter.matches.has(child) && !filter.open.has(child)) continue;
      if (count === limit) {
        rows.push(`<li class="tree-row is-more" data-more-for="${escapeHTML(node.id)}" style="--depth:${depth + 1}"><span class="tree-chevron empty"></span><button class="tree-more" data-action="more" tabindex="-1">${escapeHTML(t('tree.more'))}</button></li>`);
        break;
      }
      count++;
      visit(child, depth + 1, all);
      if (truncated) return;
    }
  };
  for (const root of tree.model.roots) {
    if (filter && !filter.matches.has(root) && !filter.open.has(root)) continue;
    visit(root, 0, false);
    if (truncated) break;
  }
  // A redraw keeps focus on the same control of the active row: Hide stays on Hide.
  const focusedAction = list.contains(document.activeElement) ? document.activeElement.dataset.action || 'select' : null;
  list.innerHTML = rows.join('');
  const status = tree.loading ? t('tree.loadingElements')
    : filter && !rows.length ? t('tree.noMatches')
      : truncated ? t('tree.truncated') : '';
  setText('tree-status', status);
  $('tree-status').hidden = !status;
  $('visibility-footer').hidden = !tree.hidden.size && !tree.isolated;
  setActiveRow(rowFor(tree.active) || list.querySelector('.tree-row'), focusedAction);
}

const rowFor = id => id && $('model-tree').querySelector(`[data-id="${CSS.escape(id)}"]`);

// One tab stop for the tree: the active row's label and actions; arrows move between rows.
// focusAction moves focus to that control of the row (the label when it has none).
function setActiveRow(row, focusAction = null) {
  const list = $('model-tree');
  for (const button of list.querySelectorAll('[tabindex="0"]')) button.tabIndex = -1;
  if (!row) return;
  if (row.dataset.id) tree.active = row.dataset.id;
  for (const button of row.querySelectorAll('.tree-label, .tree-actions button, .tree-more')) button.tabIndex = 0;
  if (focusAction) (row.querySelector(`[data-action="${focusAction}"]`) || row.querySelector('.tree-label, .tree-more'))?.focus({ preventScroll: true });
}

function focusNode(node) {
  tree.active = node.id;
  const row = rowFor(node.id);
  if (row) { setActiveRow(row, 'select'); row.scrollIntoView({ block: 'nearest' }); }
}

function toggleExpanded(node) {
  if (!node.children.length) return;
  if (tree.filter?.open.has(node)) {
    if (tree.collapsedInFilter.has(node.id)) tree.collapsedInFilter.delete(node.id); else tree.collapsedInFilter.add(node.id);
  } else if (tree.expanded.has(node.id)) tree.expanded.delete(node.id);
  else tree.expanded.add(node.id);
  tree.active = node.id;
  renderTree();
}

function updateUserVisibility() {
  tree.hiddenMeshes = hiddenMeshes(tree.model, tree.hidden, isolatedNode());
  applyVisibility();
  renderTree();
  if (selectedElement) renderElementInfo(selectedElement);
}

function toggleHidden(node) {
  const by = hiddenBy(node, tree.hidden, isolatedNode());
  if (by && by !== node) {
    notify(by === isolatedNode() ? t('tree.hiddenByIsolationNotice') : t('tree.hiddenWithNotice', { name: by.name }), 2600);
    return;
  }
  if (tree.hidden.delete(node.id)) $('announcer').textContent = t('tree.shown', { name: node.name });
  else {
    tree.hidden.add(node.id);
    // Hiding a group makes the flags of its contents redundant.
    for (const element of elementsUnder(node)) for (let item = element; item && item !== node; item = item.parent) tree.hidden.delete(item.id);
    $('announcer').textContent = t('tree.hidden', { name: node.name });
  }
  updateUserVisibility();
}

function toggleIsolate(node) {
  const on = tree.isolated !== node.id;
  tree.isolated = on ? node.id : null;
  notify(on ? t('tree.isolated', { name: node.name }) : t('tree.isolationCleared'), 1600);
  updateUserVisibility();
}

function showAll() {
  const hadFocus = $('visibility-footer').contains(document.activeElement);
  tree.hidden.clear(); tree.isolated = null;
  updateUserVisibility();
  // The footer hides itself: keep focus in the tree's panel.
  if (hadFocus) $('tree-filter').focus();
  $('announcer').textContent = t('tree.allShown');
}

function nodeBounds(node) {
  if (!node.bounds) {
    node.bounds = new THREE.Box3();
    for (const element of elementsUnder(node)) for (const mesh of element.meshes) if (mesh.userData.bounds) node.bounds.union(mesh.userData.bounds);
  }
  return node.bounds;
}

// Elements on another level than the chosen one would stay invisible; follow them.
function revealLevel(node) {
  if (state.level !== 'all' && node.level !== state.level && activeLevels[node.level]) setLevel(node.level);
}

async function zoomToNode(node) {
  if (!state.ready) return;
  if (state.mode === 'walk') await setMode(state.walkView);
  revealLevel(node);
  frameBounds(nodeBounds(node));
  notify(t('tree.framing', { name: node.name }), 1600);
  if (sidebar.isCompact()) dismissSidebar();
}

// A sheet or overlay that closes hides its controls: focus moves to the view it uncovered.
function dismissSidebar() {
  const hadFocus = $('sidebar').contains(document.activeElement);
  sidebar.dismiss();
  if (hadFocus && !$('sidebar-body').checkVisibility?.()) canvas.focus({ preventScroll: true });
}

function selectFromTree(node) {
  if (!state.ready) return;
  revealLevel(node);
  if (sidebar.isCompact()) dismissSidebar();
  inspectElement(node.meshes[0]);
  // Frame elements that are out of view; leave the camera alone otherwise. Fly and Walk
  // never move the visitor for a selection; Zoom to does that.
  if (state.mode === 'walk') return;
  const center = nodeBounds(node).getCenter(new THREE.Vector3()).project(camera);
  if (center.z < -1 || center.z > 1 || Math.abs(center.x) > 0.9 || Math.abs(center.y) > 0.9) frameBounds(nodeBounds(node));
}

function revealInTree(node) {
  if (!node) return;
  sidebar.open();
  sidebarTabs.select('model-tab');
  if (tree.filter && !tree.filter.matches.has(node) && !tree.filter.open.has(node)) {
    $('tree-filter').value = ''; tree.filter = null; $('clear-filter').hidden = true;
  }
  for (const parent of ancestors(node)) {
    if (tree.filter?.open.has(parent)) tree.collapsedInFilter.delete(parent.id); else tree.expanded.add(parent.id);
  }
  for (let item = node; item.parent; item = item.parent) {
    const index = item.parent.children.indexOf(item);
    if (index >= (tree.shown.get(item.parent.id) || TREE_PAGE)) tree.shown.set(item.parent.id, Math.ceil((index + 1) / TREE_PAGE) * TREE_PAGE);
  }
  tree.active = node.id;
  renderTree();
  const row = rowFor(node.id);
  if (row) { setActiveRow(row, 'select'); row.scrollIntoView({ block: 'center' }); }
}

function wireTree() {
  const list = $('model-tree');
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    const row = button?.closest('.tree-row');
    if (row?.dataset.moreFor) {
      // The next page appears where "More…" was; focus moves to its first row.
      const id = row.dataset.moreFor, index = [...list.children].indexOf(row);
      tree.shown.set(id, (tree.shown.get(id) || TREE_PAGE) + TREE_PAGE);
      renderTree();
      const next = list.children[index];
      if (next) setActiveRow(next, 'select');
      return;
    }
    const node = row && tree.model.nodes.get(row.dataset.id);
    if (!node) return;
    setActiveRow(row);
    switch (button.dataset.action) {
      case 'toggle': toggleExpanded(node); break;
      case 'select':
        if (node.kind === 'storey') chooseLevel(node.level);
        else if (node.kind === 'element') selectFromTree(node);
        else toggleExpanded(node);
        break;
      case 'zoom': zoomToNode(node); break;
      case 'isolate': toggleIsolate(node); break;
      case 'hide': toggleHidden(node); break;
    }
  });
  list.addEventListener('focusin', event => {
    const row = event.target.closest('.tree-row');
    if (row && row.dataset.id !== tree.active) setActiveRow(row);
  });
  list.addEventListener('keydown', event => {
    const label = event.target.closest('.tree-label, .tree-more');
    if (!label) return;
    const rows = [...list.querySelectorAll('.tree-row')];
    const row = label.closest('.tree-row');
    const index = rows.indexOf(row);
    const node = row.classList.contains('is-more') ? null : tree.model.nodes.get(row.dataset.id);
    let target = null;
    if (event.key === 'ArrowDown') target = rows[index + 1];
    else if (event.key === 'ArrowUp') target = rows[index - 1];
    else if (event.key === 'Home') target = rows[0];
    else if (event.key === 'End') target = rows.at(-1);
    else if (event.key === 'ArrowRight' && node?.children.length) {
      if (!isOpen(node)) { toggleExpanded(node); focusNode(node); } else target = rows[index + 1];
    } else if (event.key === 'ArrowLeft' && node) {
      if (isOpen(node)) { toggleExpanded(node); focusNode(node); } else if (node.parent) focusNode(node.parent);
    } else return;
    event.preventDefault();
    if (target) { setActiveRow(target, 'select'); target.scrollIntoView({ block: 'nearest' }); }
  });
  let filterTimer = 0;
  $('tree-filter').addEventListener('input', () => {
    $('clear-filter').hidden = !$('tree-filter').value;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      if (!tree.model) return;
      tree.filter = filterTree(tree.model, $('tree-filter').value);
      tree.collapsedInFilter.clear(); tree.shown.clear(); tree.active = null;
      renderTree();
      list.scrollTop = 0;
    }, 120);
  });
  $('clear-filter').addEventListener('click', () => {
    $('tree-filter').value = '';
    $('tree-filter').dispatchEvent(new Event('input'));
    $('tree-filter').focus();
  });
  $('show-all').addEventListener('click', showAll);
}

// ── Inspector ──

// Authoring scripts export raw floats and units in property names: "Base offset m" with
// 2.389041569017536e-7 reads as "Base offset" 0 m.
function tidyProperty(label, text) {
  if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(text)) return [label, text];
  const number = String(Number(Number(text).toFixed(3)));
  const unit = label.match(/ (m2|m)$/)?.[1];
  return unit ? [label.slice(0, -unit.length - 1), `${number} ${unit === 'm2' ? 'm²' : 'm'}`] : [label, number];
}

function renderElementInfo(mesh) {
  const info = elementDescription(mesh);
  const node = tree.model?.elementOf.get(mesh);
  const property = label => findProperty(info.properties, label);
  $('element-title').textContent = info.title;
  const category = node ? categoryOf(node)?.name : property('Category')?.value;
  $('element-subtitle').textContent = [category, node && storeyOf(node).level !== 'all' ? storeyOf(node).name : ''].filter(Boolean).join(' · ');
  // The summary holds the essentials; the details list the rest in the same grid, each
  // evidence text once. Inferred values carry a quiet tag with their confidence.
  const shown = new Set([property('Category'), property('Primary storey')]);
  const row = (label, item, text = item.value) => {
    shown.add(item);
    return [label, text, item.basis === 'inferred' ? t('inspector.inferredNote', { confidence: t(`confidence.${item.confidence}`) }) : ''];
  };
  const summary = [];
  const type = property('Type');
  if (type) { shown.add(type); if (cleanName(type.value) !== info.title) summary.push(row(t('inspector.type'), type, cleanName(type.value))); }
  const rooms = property('Rooms');
  if (rooms) summary.push(row(t('inspector.room'), rooms, rooms.value === 'Not assigned' ? t('inspector.notAssigned') : rooms.value.split(/,\s*/).map(humanize).join(', ')));
  if (property('IFC class')) summary.push(row(t('inspector.class'), property('IFC class')));
  if (!summary.length && property('Placement')) summary.push(row(t('inspector.placement'), property('Placement'), humanize(property('Placement').value)));
  const extent = info.properties.find(p => p.basis === 'measured' && p.label.startsWith('Model extent'));
  if (summary.length < 2 && extent) summary.push(row(t('inspector.size'), extent));
  const facts = (list, rows) => list.replaceChildren(...rows.flatMap(([label, text, note, code]) => {
    const term = document.createElement('dt'); term.textContent = label;
    const definition = document.createElement('dd'); definition.textContent = text;
    if (code) definition.className = 'code';
    if (note) {
      const tag = document.createElement('span');
      tag.className = 'inferred'; tag.textContent = t('inspector.inferred'); tag.title = note;
      definition.append(' ', tag);
    }
    return [term, definition];
  }));
  facts($('element-summary'), summary);
  const details = info.properties.filter(p => !shown.has(p)).map(p => {
    const [label, text] = tidyProperty(p.label.startsWith('Model extent') ? t('inspector.size') : p.label, p.value);
    return [...row(label, p, text), /\bID$/.test(label)];
  });
  if (info.sourceName && info.sourceName !== info.title) details.push([t('inspector.modelName'), info.sourceName]);
  details.push([t('inspector.id'), info.id || t('inspector.noId'), '', Boolean(info.id)]);
  facts($('element-properties'), details);
  const sources = [...new Set(info.properties.map(p => p.source).filter(Boolean))];
  $('element-source-list').replaceChildren(...sources.map(text => Object.assign(document.createElement('li'), { textContent: text })));
  $('element-sources').hidden = !sources.length;
  const visible = (bim?.members(mesh) || [mesh]).some(part => part.visible);
  $('element-visibility').hidden = visible;
  const hidden = node ? Boolean(hiddenBy(node, tree.hidden, isolatedNode())) : false;
  $('element-hide').querySelector('span').textContent = t(hidden ? 'inspector.show' : 'inspector.hide');
  $('element-hide').querySelector('use').setAttribute('href', hidden ? '#i-eye' : '#i-eye-off');
  $('element-hide').disabled = !node;
  $('element-reveal').disabled = !node;
  placeInspector();
}

function inspectElement(mesh, { point = null } = {}) {
  clearHighlight?.();
  const members = bim?.members(mesh) || [mesh];
  selectedElement = mesh;
  $('element-details').open = false;
  const bounds = bim?.bounds(mesh) || mesh.userData.bounds || new THREE.Box3().setFromObject(mesh);
  inspectorAnchor = point ? point.clone() : bounds.getCenter(new THREE.Vector3());
  $('inspector').hidden = false;
  renderElementInfo(mesh);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--color-selection').trim() || '#38d9ff';
  clearHighlight = bim?.product(mesh) ? highlightElements(members, color) : highlightElement(mesh, color);
  renderTree();
  $('announcer').textContent = t('inspector.selected', { name: $('element-title').textContent });
  invalidate();
}

function closeInspector() {
  if ($('inspector').hidden) return;
  const hadFocus = $('inspector').contains(document.activeElement);
  $('inspector').hidden = true;
  $('pick-marker').hidden = true;
  clearHighlight?.(); clearHighlight = null; selectedElement = null; inspectorAnchor = null;
  renderTree();
  if (hadFocus) canvas.focus({ preventScroll: true });
  invalidate();
}

// Follows the selected element: the marker sits on the picked point and the callout
// beside it, between the toolbar and the bottom controls. Coordinates are stage-relative.
const projected = new THREE.Vector3();
function placeInspector() {
  const panel = $('inspector');
  if (!inspectorAnchor || panel.hidden || !camera) return;
  const rect = canvas.getBoundingClientRect();
  projected.copy(inspectorAnchor).project(camera);
  const onScreen = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
  const x = (projected.x + 1) / 2 * rect.width, y = (1 - projected.y) / 2 * rect.height;
  const marker = $('pick-marker');
  marker.hidden = !onScreen;
  if (onScreen) { marker.style.left = `${x}px`; marker.style.top = `${y}px`; }
  if (sidebar.isCompact()) {
    panel.dataset.side = 'none';
    for (const key of ['left', 'top']) panel.style.removeProperty(key);
    return;
  }
  const topbar = document.querySelector('.topbar').getBoundingClientRect();
  const controls = document.querySelector('.dock').getBoundingClientRect();
  const rail = $('camera-tools').getBoundingClientRect();
  const area = { left: 16, right: Math.min(rect.width - 16, rail.left - rect.left - 12), top: topbar.bottom - rect.top + 12, bottom: controls.top - rect.top - 12 };
  // The floating sidebar covers the stage's left side when it reaches below the toolbar.
  const side = $('sidebar').getBoundingClientRect();
  if (side.bottom - rect.top > area.top) area.left = Math.max(0, side.right - rect.left) + 16;
  const placement = calloutPlacement(onScreen ? { x, y } : { x: area.right, y: area.top }, { width: panel.offsetWidth, height: panel.offsetHeight }, area);
  panel.style.left = `${placement.left}px`;
  panel.style.top = `${placement.top}px`;
  panel.dataset.side = onScreen ? placement.side : 'none';
  panel.style.setProperty('--arrow-y', `${placement.arrow}px`);
}

// ── Controls ──

const sidebar = wireSidebar({ onChange: () => { if (frameLoop) resize(); placeInspector(); } });
const sidebarTabs = wirePanelTabs(document.querySelector('.sidebar-tabs'));

function wireControls() {
  $('copy-view-link').addEventListener('click', async () => {
    if (!state.ready) return;
    syncViewURL();
    const button = $('copy-view-link');
    // Busy, not disabled: a disabled button would drop keyboard focus to the page.
    if (button.getAttribute('aria-disabled') === 'true') return;
    const url = currentViewLink().href;
    const label = button.querySelector('span');
    button.setAttribute('aria-disabled', 'true'); label.textContent = t('menu.copying');
    $('share-status').hidden = true;
    let timeout;
    try {
      // Some embedded browsers leave clipboard permission pending indefinitely.
      await Promise.race([navigator.clipboard.writeText(url), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Clipboard unavailable')), 1500);
      })]);
      $('view-link-text').hidden = true;
      $('share-status').textContent = t('menu.copied');
    } catch {
      $('view-link-text').hidden = false;
      $('share-status').textContent = t('menu.copyManually');
      $('view-link-text').value = url;
      $('view-link-text').focus(); $('view-link-text').select();
    } finally {
      clearTimeout(timeout);
      button.removeAttribute('aria-disabled'); label.textContent = t('menu.copyLink');
      // Closed meanwhile: the message would only reappear stale next time.
      const menu = $('menu');
      $('share-status').hidden = !(typeof menu.showPopover === 'function' ? menu.matches(':popover-open') : !menu.hidden);
    }
  });
  $('menu').addEventListener('toggle', event => {
    if (event.newState !== 'closed') return;
    $('share-status').hidden = true; $('view-link-text').hidden = true;
    $('quality-options').hidden = true; $('quality-toggle').setAttribute('aria-expanded', 'false');
  });
  $('quality-toggle').addEventListener('click', () => {
    const open = $('quality-options').hidden;
    $('quality-options').hidden = !open;
    $('quality-toggle').setAttribute('aria-expanded', String(open));
  });
  for (const input of qualityInputs) input.addEventListener('change', () => {
    try { localStorage.setItem('building-viewer:quality', renderQuality()); } catch { /* Rendering still updates. */ }
    updateAboutFacts();
    resize();
  });
  if (typeof $('help').showPopover !== 'function') $('menu-help').addEventListener('click', () => openDropdown('help'));
  wirePanelTabs(document.querySelector('.segmented'));
  wireTree();
  touchWalk = wireTouchWalk({ canvas, buttons: document.querySelectorAll('[data-walk-key]'), camera: walkCamera, keys, invalidate });
  wirePicking({ canvas, camera: () => camera, meshes: () => state.meshes,
    enabled: () => state.ready && !dropdownOpen(),
    onPick: (mesh, hit) => inspectElement(mesh, hit), onMiss: closeInspector });
  $('close-inspector').addEventListener('click', closeInspector);
  $('element-details').addEventListener('toggle', placeInspector);
  $('element-zoom').addEventListener('click', () => {
    const node = selectedNode();
    if (node) zoomToNode(node);
    else if (selectedElement) frameBounds(bim?.bounds(selectedElement) || selectedElement.userData.bounds || new THREE.Box3().setFromObject(selectedElement));
  });
  $('element-hide').addEventListener('click', () => {
    const node = selectedNode();
    if (node) toggleHidden(node);
  });
  $('element-reveal').addEventListener('click', () => revealInTree(selectedNode()));
  modeButtons.forEach(button => button.addEventListener('click', () => chooseView(button.dataset.mode)));
  navButtons.forEach(button => button.addEventListener('click', () => chooseNavigation(button.dataset.nav)));
  $('reset').addEventListener('click', () => resetView());
  $('zoom-in').addEventListener('click', () => zoomView(0.8));
  $('zoom-out').addEventListener('click', () => zoomView(1.25));
  $('surroundings').addEventListener('change', () => {
    if (!$('surroundings').checked) pendingSiteView = false;
    surroundings.error = '';
    storePreference('surroundings', $('surroundings').checked);
    updateSurroundings();
  });
  $('muted-surroundings').addEventListener('change', () => {
    const muted = $('muted-surroundings').checked;
    storePreference('muted-surroundings', muted);
    surroundings.style?.setMuted(muted);
    surroundings.instances?.sync();
    refreshSurroundings();
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  });
  $('retry-surroundings').addEventListener('click', () => {
    surroundings.error = '';
    $('surroundings').checked = true;
    updateSurroundings();
    // The retry button hides itself: focus moves to the switch it turned on.
    $('surroundings').focus();
  });
  $('brightness').addEventListener('input', applyLightingAppearance);
  $('daylight').addEventListener('change', updateDaylight);
  $('daylight-date').addEventListener('change', updateDaylight);
  $('daylight-hour').addEventListener('change', () => {
    if (!$('daylight-hour').validity.valid) return;
    const [hour, minute] = $('daylight-hour').value.split(':').map(Number);
    daylightMinutes = hour * 60 + minute;
    updateDaylight();
  });
  $('daylight-now').addEventListener('click', () => {
    const now = localParts(new Date(), activeModel.location.timeZone);
    setDaylightDate(now.year, dayOfYear(now));
    daylightMinutes = now.hour * 60 + now.minute;
    updateDaylight();
  });
  $('shadows').addEventListener('change', applyLightingAppearance);
  $('reset-lighting').addEventListener('click', () => {
    resetLightingControls();
    updateDaylight();
    $('daylight').focus({ preventScroll: true });
  });
  $('fullscreen').hidden = !document.fullscreenEnabled;
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('viewer').requestFullscreen();
    } catch { notify(t('menu.fullscreenUnavailable')); }
  });
  document.addEventListener('fullscreenchange', () => {
    showFullscreenLabel();
    resize();
  });
  showFullscreenLabel();
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('inspector').hidden && !dropdownOpen() && !event.target.closest?.('.dropdown, input, select')) { closeInspector(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target !== canvas) return;
    const zoom = zoomKey(event);
    if (zoom) { event.preventDefault(); zoomView(zoom); return; }
    // In Fly and Walk, R sits beside E (rise); Fit building on the camera rail serves every mode.
    if (event.code === 'KeyR' && !event.repeat && state.mode !== 'walk') { event.preventDefault(); resetView(); }
    if (!isWalking()) {
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (directions[event.code] && state.mode !== 'walk') {
        event.preventDefault();
        const [horizontal, vertical] = directions[event.code];
        navigate({ horizontal, vertical, pan: event.shiftKey });
      }
      if (event.key === '?' || event.code === 'KeyH') openDropdown('help');
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  reducedMotion.addEventListener('change', () => {
    orbit.enableDamping = plan.enableDamping = !reducedMotion.matches;
    invalidate();
  });
  window.addEventListener('blur', releaseMovement);
  window.addEventListener('pagehide', event => {
    syncViewURL();
    if (!event.persisted) {
      assetAbort.abort(); collisionAbort.abort(); frameLoop.stop();
      clearHighlight?.();
      buildingInstances?.dispose();
      disposeSurroundings();
      disposeAsset(model); disposeAsset(daylight?.sky);
      for (const material of uncutMaterials.values()) material.dispose();
      environmentTarget?.dispose(); sun.shadow.map?.dispose();
      orbit.dispose(); plan.dispose(); renderer.dispose();
    }
  });
  document.addEventListener('visibilitychange', () => {
    releaseMovement();
    state.previousTime = performance.now();
    frameLoop.setPaused(document.hidden);
    invalidate();
  });
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  // Touch or mouse first: the pad, the hints and the render budget follow.
  touchPrimary.addEventListener('change', () => {
    resize();
    if (state.walking) setWalkingActive(true);
    if (state.ready) updateInterface();
  });
  screen.orientation?.addEventListener('change', releaseMovement);
  // The error card offers Reload; showError stops rendering and every load.
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    showError(keyedError('error.contextLost'));
  });
}

const walkPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
function render(time) {
  const delta = state.previousTime ? (time - state.previousTime) / 1000 : 0;
  state.previousTime = time;
  if (document.hidden) return;
  if (orbit.enabled && orbit.update()) invalidate();
  if (plan.enabled && plan.update()) invalidate();
  if (isWalking() && state.walker) {
    walkPose.position.copy(camera.position); walkPose.quaternion.copy(camera.quaternion);
    if (state.walker.update(delta, keys)) notify(t('walk.returned'));
    if (!camera.position.equals(walkPose.position) || !camera.quaternion.equals(walkPose.quaternion)) invalidate();
  }
  // Nothing is drawn before the building and its surroundings are presented together.
  if (state.dirty && state.presented) {
    updateShadowFraming();
    renderScene();
    placeInspector();
    state.dirty = false;
  }
  return isWalking() && Boolean(state.walker);
}

$('retry').addEventListener('click', () => location.reload());
wireDropdowns();
// The language menu works even when the 3D view cannot start, so errors can be read too.
wireLanguageMenu();
onLanguageChange(refreshLanguage);
wireResponsiveLayout();
showBrightness();
try { initialize(); } catch (error) { showError(error); }
