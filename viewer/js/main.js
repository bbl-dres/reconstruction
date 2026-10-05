import * as THREE from 'three';
import { loadGLB, paintOpportunity, prepareStaticModel, disposeAsset } from './asset-loader.js?v=gzip-5';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LEVELS, WALK_STARTS, visibleInMode, collisionCandidate } from 'building-policy';
import { building } from './building-config.js';
import { Walker } from './walking.js?v=v019-galleries';
import { prepareCollisionWorld } from './collision-loader.js?v=v019-galleries';
import { restoreView, navigateView, settle, toPlan, fromPlan, copyPerspective } from './view-navigation.js?v=lens-2';
import { readViewURL, writeViewURL } from './view-url.js?v=exterior-default';
import { createRenderInstances } from './render-instances.js?v=bim-1';
import { wirePanelTabs, wireDropdowns, wireSidebar, wireMenuKeys, closeDropdowns, dropdownOpen, openDropdown, setRangeDescription } from './interface.js?v=mobile-1';
import { createSurroundingsStyle } from './surroundings-style.js?v=sky-ibl-1';
import { parseMetadata, describeElement } from './model-metadata.js?v=archive-levels-1';
import { wirePicking, highlightElement, highlightElements } from './inspection.js?v=redesign-1';
import { parseBimRegistry, describeProduct } from './bim-registry.js?v=redesign-1';
import { parseCatalog, chooseModel } from './model-catalog.js?v=archive-levels-1';
import { Daylight } from './daylight.js?v=sky-ibl-1';
import { STUDIO, studioSunDirection, applyStudioLights, createSkyEnvironment } from './lighting.js?v=sky-ibl-1';
import { localParts, dayOfYear, calendarSelection, calendarDate } from './solar-time.js?v=calendar-2';
import { renderBudget, calloutPlacement } from './view-layout.js?v=mobile-1';
import { orderedLevels, adjacentLevel } from './levels.js?v=mobile-1';
import { wireTouchWalk } from './touch-walk.js';
import { createFrameLoop } from './frame-loop.js';
import { fitDirectionalShadow, shadowCoverage } from './shadow-fit.js?v=lens-2';
import { buildModelTree, filterTree, hiddenBy, hiddenMeshes, ancestors, elementsUnder, humanize, cleanName } from './model-tree.js?v=redesign-1';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const modeNames = { orbit: 'Exterior', dollhouse: 'Dollhouse', plan: 'Floor plan', walk: 'Walk' };
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const navButtons = [...document.querySelectorAll('[data-nav]')];
const keys = new Set();
// mode is the camera mode; walkView is what Walk and Fly show (Exterior or Dollhouse visibility).
// walking: Walk or Fly is moving the walking camera, looking by drag, with the pad on touch screens.
const state = { mode: 'orbit', level: 'all', planLevel: null, ready: false, presented: false, dirty: true, meshes: [], materials: new Set(), walker: null, collision: null, walking: false, walkPad: false, walkView: 'orbit', navIntent: 'walk', modeRequest: 0, previousTime: 0, noticeTimer: 0 };
let renderer, scene, camera, perspective, walkCamera, orthographic, orbit, plan, sun, fillLight, model, daylight, environmentTarget;
let frameLoop;
let buildingInstances;
let shadowScope = 'building';
let shadowDirty = true;
let buildingBounds = new THREE.Box3();
let casterBounds = new THREE.Box3();
let viewportSize = '';
let collisionPromise = null;
const collisionAbort = new AbortController();
const assetAbort = new AbortController();
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
let levelMenuMarkup = '';
const config = building();
const modelBase = new URL(config.models, config.baseUrl);
const walkStarts = Object.keys(WALK_STARTS).length ? WALK_STARTS : config.walkStarts;
let activeModel = null;
let activeLevels = LEVELS;
const diagnostics = new URL(location.href).searchParams.has('stats');
// Model tree: hidden and isolated hold node IDs; hiddenMeshes is derived from them.
const TREE_PAGE = 50, TREE_ROWS = 500;
const tree = { model: null, loading: true, expanded: new Set(), collapsedInFilter: new Set(), hidden: new Set(), isolated: null, filter: null, shown: new Map(), active: null, hiddenMeshes: new Set() };
const qualityLabels = { auto: 'Automatic', high: 'Higher detail', low: 'Lower power' };
const qualityInputs = [...document.querySelectorAll('[name="render-quality"]')];
const renderQuality = () => qualityInputs.find(input => input.checked)?.value || 'auto';
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = id => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

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
  if (quality in qualityLabels) qualityInputs.find(input => input.value === quality).checked = true;
} catch { /* Use automatic quality when storage is unavailable. */ }

function showError(error) {
  console.error(error);
  state.ready = false;
  state.presented = false;
  assetAbort.abort(error);
  collisionAbort.abort(error);
  frameLoop?.stop();
  [...modeButtons, ...navButtons].forEach(button => { button.disabled = true; });
  for (const id of ['reset', 'lighting-toggle', 'copy-view-link', 'level-toggle']) $(id).disabled = true;
  closeDropdowns();
  closeInspector();
  stopWalking();
  $('camera-tools').hidden = true;
  $('loading').hidden = false;
  $('loading-title').textContent = 'Unable to open the viewer';
  $('loading-detail').textContent = location.protocol === 'file:'
    ? 'Start the local server with “python tools/serve.py” from the repository root, then open the address it prints.'
    : /fetch|404|not found/i.test(error.message || '')
      ? 'The building file could not be loaded. Check that the local server is running and the model has been imported, then try again.'
      : error.message || 'Check that WebGL is enabled and the local model is available.';
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
  return writeViewURL(location.href, { version: activeModel.id, mode: state.mode, level: state.level,
    position: camera.position.toArray(), target: target.toArray(), zoom: camera.zoom,
    halfHeight: orthographic.top, orbit: orbitDirection.toArray(), cut: Number($('cut-height').value),
    surroundings: $('surroundings').checked, muted: $('muted-surroundings').checked });
}

function syncViewURL() {
  clearTimeout(urlTimer); urlTimer = 0;
  if (!state.ready) return;
  const url = currentViewLink();
  // Replace, rather than push, so camera drags don't fill browser history.
  if (url.href !== location.href) try { history.replaceState(history.state, '', url); } catch { /* Copy link still works. */ }
}

function restoreLink() {
  const view = readViewURL(location.href, activeModel.levels);
  if (!view) return null;
  state.mode = view.mode; state.level = view.level;
  $('cut-height').value = String(view.cut);
  $('cut-value').textContent = `${view.cut.toFixed(1)} m`;
  setRangeDescription($('cut-height'), `${view.cut.toFixed(1)} meters above the selected floor`);
  if (view.surroundings !== undefined) $('surroundings').checked = view.surroundings;
  if (view.muted !== undefined) $('muted-surroundings').checked = view.muted;
  camera = view.mode === 'plan' ? orthographic : view.mode === 'walk' ? walkCamera : perspective;
  orbit.enabled = ['orbit', 'dollhouse'].includes(view.mode); plan.enabled = view.mode === 'plan';
  if (view.orbit) orbitDirection.fromArray(view.orbit).normalize();
  if (!view.snapshot) return false;
  const saved = { ...view.snapshot, position: new THREE.Vector3().fromArray(view.snapshot.position), target: new THREE.Vector3().fromArray(view.snapshot.target) };
  if (view.mode === 'walk') {
    camera.position.copy(saved.position); camera.lookAt(saved.target); camera.zoom = saved.zoom; camera.updateProjectionMatrix();
  } else {
    orbit.maxDistance = Math.max(orbit.maxDistance, saved.position.distanceTo(saved.target) * 1.1);
    if (view.mode === 'plan') { saved.position.x = saved.target.x; saved.position.z = saved.target.z; saved.position.y = Math.max(saved.target.y + 150, saved.position.y); }
    restoreView(saved, camera, view.mode === 'plan' ? plan : orbit, canvas.clientWidth / canvas.clientHeight);
  }
  camera.far = Math.max(camera.far, saved.position.distanceTo(saved.target) * 2);
  camera.updateProjectionMatrix();
  return true;
}
function notify(message, duration = 5500) {
  clearTimeout(state.noticeTimer);
  $('notice').textContent = message;
  $('notice').hidden = false;
  state.noticeTimer = setTimeout(() => { $('notice').hidden = true; }, duration);
}

function initialize() {
  if (location.protocol === 'file:') throw new Error('A local HTTP server is required.');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: touchPrimary.matches ? 'default' : 'high-performance' });
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
  const today = localParts(new Date());
  // Fresh visits always start in studio lighting (sun and sky, shadows off), even if the browser restores forms.
  $('daylight').checked = false;
  $('shadows').checked = STUDIO.shadows;
  $('brightness').value = String(STUDIO.exposure);
  setDaylightDate(today.year, dayOfYear(today));
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
    if (!response.ok) throw new Error('The model catalog could not be loaded. Refresh after importing the model.');
    const models = parseCatalog(await response.json());
    const requested = new URL(location.href).searchParams.get('version');
    activeModel = chooseModel(models, requested);
    activeLevels = activeModel.levelDefinitions || LEVELS;
    $('model-version').textContent = activeModel.label;
    $('daylight').disabled = !activeModel.location;
    document.title = `${config.name} ${activeModel.label} · Building explorer`;
    $('loading-title').textContent = `Opening ${config.name} · ${activeModel.label}`;
    // Levels are usable as soon as the building is; elements follow with the registry.
    buildTree(null, []);
    renderLevelPicker();
    if (requested && activeModel.id !== requested) notify(`That version is no longer published. Opened ${activeModel.label}.`);
    loadMetadata();
    loadModel();
  } catch (error) { if (!assetAbort.signal.aborted) showError(error); }
}

async function loadModel() {
  let pendingRoot;
  try {
    const signal = assetAbort.signal;
    const gltf = await loadGLB(new URL(activeModel.building, modelBase), { signal, onProgress: progress => {
      if (signal.aborted) return;
      if (progress.percent === null) $('load-progress').removeAttribute('value');
      else $('load-progress').value = progress.percent;
      const percent = progress.percent === 99 ? 99 : Math.floor(progress.percent / 5) * 5;
      const detail = progress.phase === 'decode' ? 'Opening geometry and textures…'
        : progress.percent === null ? 'Starting the building download…'
          : `Downloading building · ${percent}% of ${(progress.total / 1_000_000).toFixed(1)} MB`;
      if ($('loading-detail').textContent !== detail) $('loading-detail').textContent = detail;
    } });
    pendingRoot = gltf.scene;
    $('loading-detail').textContent = 'Preparing the building view…';
    await paintOpportunity(signal);
    let triangles = 0;
    const materials = new Set();
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const meshes = await prepareStaticModel(pendingRoot, { signal, onMesh: mesh => {
      mesh.name = mesh.userData.viewer_source_name || mesh.name.replaceAll('_', ' ');
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        material.clipShadows = true;
        if (material.map) material.map.anisotropy = anisotropy;
      }
    } });
    signal.throwIfAborted();
    model = pendingRoot;
    state.meshes = meshes;
    state.materials = materials;
    scene.add(model);
    if (new URL(location.href).searchParams.get('instances') !== '0') buildingInstances = createRenderInstances(meshes, scene);
    $('model-stats').textContent = `${state.meshes.length} meshes · ${Math.round(triangles / 1000)}k triangles · ${activeModel.label}`;
    $('model-stats').hidden = !diagnostics;
    const linkRestored = restoreLink();
    applyVisibility();
    if (!linkRestored) {
      if (state.mode === 'walk') {
        camera = perspective; frameView(); copyPerspective(perspective, walkCamera); camera = walkCamera;
      } else frameView();
    }
    renderer.shadowMap.needsUpdate = true;
    updateShadowFraming();
    // Compile with the final lighting/clipping configuration. The normal frame
    // loop waits until this first presentation, keeping the loading state true.
    await renderer.compileAsync(scene, camera);
    signal.throwIfAborted();
    renderScene();
    pendingRoot = null;
    state.ready = true;
    state.presented = true;
    $('loading').hidden = true;
    renderPlaces();
    loadBim();
    [...modeButtons, ...navButtons].forEach(button => { button.disabled = false; });
    for (const id of ['reset', 'surroundings', 'lighting-toggle', 'copy-view-link', 'level-toggle']) $(id).disabled = false;
    updateInterface();
    if (state.mode === 'walk') prepareWalk(++state.modeRequest);
    // Give the actual building a paint opportunity before optional context work.
    paintOpportunity(signal).then(updateSurroundings).catch(() => {});
    $('announcer').textContent = `${config.name} ${activeModel.label} is ready. ${modeNames[state.mode]}. Open Help for navigation controls.`;
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

function applyVisibility() {
  const view = displayMode();
  const section = activeLevels[state.level];
  const clip = Boolean(section && view === 'plan');
  if (clip) {
    cutPlanes[0].constant = section.elevation + Number($('cut-height').value);
    cutPlanes[1].constant = -section.min;
  }
  const policyLevel = tree.loading ? state.level : 'all';
  for (const mesh of state.meshes) mesh.visible = visibleInMode(mesh, view, policyLevel, activeLevels) && inLevel(mesh) && !tree.hiddenMeshes.has(mesh);
  clearHighlight?.syncVisibility?.();
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
  $('fit-surroundings').hidden = !visible || !surroundings.root;
  $('retry-surroundings').hidden = !surroundings.error;
  $('surroundings-status').textContent = surroundings.error
    || (enabled && state.mode === 'plan' ? 'Paused in floor plan. Floor plan always hides the site.'
      : enabled && surroundings.loading ? (surroundings.phase !== 'download' ? 'Preparing surroundings…' : surroundings.progress === null ? 'Starting surroundings download…' : `Downloading surroundings · ${surroundings.progress}%`)
        : 'Floor plan always hides the site.');
  $('muted-row').classList.toggle('dimmed', !enabled);
  $('surroundings-toggle').classList.toggle('surroundings-hidden', !enabled);
}

function updateSurroundings() {
  refreshSurroundings();
  // Keep the initial load small. One in-flight request is reused across toggles.
  if (assetAbort.signal.aborted || !state.ready || !state.presented || !$('surroundings').checked || state.mode === 'plan' || surroundings.root || surroundings.loading) return;
  surroundings.loading = true;
  surroundings.progress = null;
  surroundings.phase = 'download';
  surroundings.error = '';
  refreshSurroundings();
  let pendingRoot;
  const signal = assetAbort.signal;
  loadGLB(new URL(activeModel.surroundings, modelBase), { signal, onProgress: progress => {
    if (signal.aborted) return;
    surroundings.progress = progress.percent;
    surroundings.phase = progress.phase;
    refreshSurroundings();
  } }).then(async gltf => {
    const root = gltf.scene;
    pendingRoot = root;
    // The export shares the building's original origin, scale and orientation.
    root.visible = false;
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const meshes = await prepareStaticModel(root, { signal, onMesh: mesh => {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        surroundings.materials.add(material);
        if (material.map) material.map.anisotropy = anisotropy;
      }
    } });
    signal.throwIfAborted();
    const style = createSurroundingsStyle(root);
    if (new URL(location.href).searchParams.get('instances') !== '0') surroundings.instances = createRenderInstances(meshes, scene);
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
    // Site bookmarks requested before this asset loaded need visible bounds.
    refreshSurroundings();
    if (pendingSiteView && $('surroundings').checked && state.mode === 'orbit') frameView(true);
    pendingSiteView = false;
    if ($('surroundings').checked && state.mode !== 'plan') $('announcer').textContent = 'Surroundings ready. Use Fit site to see the wider neighborhood.';
  }).catch(error => {
    surroundings.instances?.dispose(); surroundings.instances = null;
    surroundings.style?.setMuted(false);
    surroundings.style?.dispose(); surroundings.style = null;
    surroundings.root = null;
    surroundings.prepared = false;
    disposeAsset(pendingRoot);
    surroundings.materials.clear();
    if (signal.aborted) return;
    pendingSiteView = false;
    console.error('Surroundings could not be loaded:', error);
    surroundings.error = 'Surroundings unavailable.';
    if ($('surroundings').checked) notify('Surroundings could not be loaded. The building is still available.');
    $('surroundings').checked = false;
  }).finally(() => {
    surroundings.loading = false;
    // Respect the current checkbox and mode even if they changed during loading.
    if (!signal.aborted) refreshSurroundings();
  });
}

function visibleBounds(includeSurroundings = false) {
  const bounds = new THREE.Box3();
  for (const mesh of state.meshes) if (mesh.visible) bounds.union(mesh.userData.bounds);
  if (bounds.isEmpty()) return new THREE.Box3(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 30, 30));
  const section = activeLevels[state.level];
  if (section && displayMode() === 'plan') {
    bounds.min.y = section.min;
    bounds.max.y = section.elevation + Number($('cut-height').value);
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
  if (!state.meshes.length || !renderer.shadowMap.enabled || !sun.castShadow) return;
  const bounds = shadowBounds();
  if (!shadowDirty) return;
  fitDirectionalShadow(sun, bounds.receivers, bounds.casters);
  renderer.shadowMap.needsUpdate = true;
  shadowDirty = false;
}

function frameView(includeSurroundings = false) {
  // Stop drag momentum before fitting a new floor or the wider site.
  const control = state.mode === 'plan' ? plan : orbit;
  const damping = control.enableDamping;
  control.enableDamping = false;
  control.update();
  control.enableDamping = damping;
  const bounds = visibleBounds(includeSurroundings);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  if (state.mode === 'plan') {
    orthographic.position.set(center.x, bounds.max.y + 150, center.z);
    plan.target.copy(center);
    // fit to both viewport dimensions, allowing room for the floating controls
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const height = Math.max(size.z * 1.25, size.x / aspect * 1.25, 20);
    orthographic.left = -height * aspect / 2;
    orthographic.right = height * aspect / 2;
    orthographic.top = height / 2;
    orthographic.bottom = -height / 2;
    orthographic.zoom = 1;
    orthographic.updateProjectionMatrix();
    plan.update();
  } else {
    const radius = size.length() / 2;
    const halfFov = THREE.MathUtils.degToRad(perspective.fov / 2);
    const fitFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * perspective.aspect));
    const distance = radius / Math.sin(fitFov) * (state.mode === 'dollhouse' ? 1.03 : 1.06);
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
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const height = Math.max(size.z * 1.6, size.x / aspect * 1.6, 2);
    orthographic.zoom = THREE.MathUtils.clamp((orthographic.top - orthographic.bottom) / height, plan.minZoom, plan.maxZoom);
    orthographic.updateProjectionMatrix();
    plan.update();
  } else {
    const radius = Math.max(size.length() / 2, 0.5);
    const halfFov = THREE.MathUtils.degToRad(perspective.getEffectiveFOV() / 2);
    const fitFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * perspective.aspect));
    const distance = THREE.MathUtils.clamp(radius / Math.sin(fitFov) * 1.2, orbit.minDistance, orbit.maxDistance);
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
  const aspect = canvas.clientWidth / canvas.clientHeight;
  if (previous !== 'walk') settle(previous === 'plan' ? plan : orbit);
  stopWalking();
  if (previous === 'walk') {
    settle(orbit);
    copyPerspective(walkCamera, perspective);
    orbit.target.copy(walkCamera.position).addScaledVector(walkCamera.getWorldDirection(new THREE.Vector3()), 10);
    orbit.update();
  } else if (previous === 'plan') {
    fromPlan(orthographic, plan.target, orbitDirection, perspective, orbit, aspect);
  }
  if (mode === 'plan') {
    orbitDirection.copy(perspective.position).sub(orbit.target).normalize();
    toPlan(perspective, orbit.target, orthographic, plan, aspect, buildingBounds.max.y + 150);
  } else if (mode === 'walk') {
    copyPerspective(perspective, walkCamera);
    state.walkView = previous === 'dollhouse' ? 'dollhouse' : 'orbit';
  }
  state.mode = mode;
  keys.clear();
  camera = mode === 'plan' ? orthographic : mode === 'walk' ? walkCamera : perspective;
  orbit.enabled = mode === 'orbit' || mode === 'dollhouse';
  plan.enabled = mode === 'plan';
  // Plan needs one floor: prefer the Bundeshaus-era 'principal' ID, else the first defined floor.
  // A floor plan picks it for the visitor, so leaving the plan shows all levels again.
  if (previous === 'plan' && state.planLevel === state.level) state.level = 'all';
  state.planLevel = null;
  if (mode === 'plan' && state.level === 'all') {
    const levels = activeModel?.levels || ['principal'];
    state.level = state.planLevel = levels.includes('principal') ? 'principal' : levels.find(level => level !== 'all') || 'all';
  }
  applyVisibility();
  updateInterface();
  if (mode === 'plan') noteEmptyLevel();
  if (mode === 'walk') {
    await prepareWalk(request);
    if (state.mode !== mode || request !== state.modeRequest || !state.ready) return;
  }
  $('announcer').textContent = modeNames[mode] + (state.level !== 'all' ? ` · ${levelLabel()}` : '');
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
    $('announcer').textContent = `${modeNames[view]} · ${state.navIntent === 'fly' ? 'Fly' : 'Walk'}`;
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
  // On narrower screens the floating panel would cover the view and the movement pad.
  sidebar.dismiss();
  if (state.mode !== 'walk') { await setMode('walk'); return; }
  if (!state.walker) { updateNavButtons(); return; }
  applyNavigation();
  startWalking();
  updateInterface();
}

function applyNavigation() {
  const walker = state.walker;
  if (state.navIntent === 'fly') walker.setFlying(true);
  else if (walker.flying) {
    // Walking needs a floor: return to the last one, else start in the first room.
    if (walker.hasSafePosition) walker.setFlying(false);
    else if (startInRoom()) walker.setFlying(false);
    else {
      state.navIntent = 'fly';
      notify('There is no walking start here. Flying instead.');
    }
  }
}

// The building's first walking start, for a walk that begins above the floor.
function startInRoom() {
  const [start] = Object.values(walkStarts);
  return Boolean(start && state.walker?.spawn(start.position, start.target));
}

async function prepareWalk(request) {
  closeDropdowns();
  if (!state.collision) {
    const preparing = 'Preparing walking surfaces…';
    notify(preparing, 60000);
    try {
      collisionPromise ||= prepareCollisionWorld(state.meshes, collisionAbort.signal, collisionCandidate).then(result => {
        state.collision = result;
        state.walker = new Walker(walkCamera, result.world);
      }).catch(error => { collisionPromise = null; throw error; });
      await collisionPromise;
    } catch (error) {
      if (state.mode !== 'walk' || request !== state.modeRequest || !state.ready) return;
      console.error(error);
      notify(error.message || 'Walking surfaces could not be prepared. Switch to Orbit and try again.');
      return;
    } finally {
      if ($('notice').textContent === preparing) $('notice').hidden = true;
    }
  }
  // Changing modes during preparation must never start a stale walk.
  if (state.mode !== 'walk' || request !== state.modeRequest || !state.ready) return;
  // Preserve this camera, including shared links. Walking from a viewpoint above the
  // floor starts in the first room; flying starts here.
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
  if (state.mode === 'plan') return touchPrimary.matches ? 'Floor plan · drag to pan, pinch to zoom' : 'Floor plan · drag to pan, scroll to zoom';
  if (state.mode === 'walk') return state.walker?.flying ? 'Fly · WASD moves, drag looks, Q/E down and up' : 'Walk · WASD moves, drag looks, Space jumps';
  return touchPrimary.matches ? 'Orbit · drag to orbit, two fingers pan or pinch' : 'Orbit · drag to orbit, right-drag to pan, scroll to zoom';
}

function levelLabel() {
  return state.level === 'all' ? 'All levels' : activeLevels[state.level]?.label || humanize(state.level);
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
  $('cut-control').hidden = view !== 'plan';
  $('navigation-hint').textContent = navigationHint();
  renderLevelPicker();
  canvas.setAttribute('aria-label', mode === 'plan' ? 'Building floor plan. Drag to pan and pinch or scroll to zoom.' : mode === 'walk' ? 'First person building view. Drag to look around; WASD, arrows or the direction buttons move.' : '3D building. Drag to orbit; pinch or scroll to zoom.');
  $('canvas-help').textContent = mode === 'walk'
    ? 'With the viewer focused: WASD or arrows move, dragging looks around and Shift speeds up. Walking, Space jumps; flying, E rises and Q descends. Page Up and Page Down change the level. On touch screens, hold the direction buttons. Tab moves to the controls.'
    : `With the viewer focused: ${mode === 'plan' ? 'arrow keys pan' : 'arrow keys rotate, Shift and arrows pan'}, plus and minus zoom, R fits the building, Page Up and Page Down change the level. H opens Help. Tab moves to the controls.`;
  updateNavButtons();
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
  state.walkPad = active && touchPrimary.matches;
  touchWalk?.setActive(active);
  keys.clear();
  if (state.walker) state.walker.velocity.set(0, 0, 0);
  $('touch-walk').hidden = !state.walkPad;
  document.body.classList.toggle('touch-walking', state.walkPad);
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

function updateAboutFacts() {
  const sky = $('daylight').checked && activeModel?.location;
  $('about-lighting').textContent = `${sky ? 'Sun & sky' : 'Studio'} · shadows ${$('shadows').checked ? 'on' : 'off'}`;
  $('about-quality').textContent = qualityLabels[renderQuality()];
}

function applyLightingAppearance() {
  // Brightness and shadows apply to studio and daylight alike; Floor plan stays shadow-free for legibility.
  renderer.toneMappingExposure = Number($('brightness').value);
  $('brightness-value').textContent = Number($('brightness').value).toFixed(1);
  setRangeDescription($('brightness'), `${Math.round(Number($('brightness').value) * 100)} percent`);
  const shadows = $('shadows').checked && state.mode !== 'plan';
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    for (const material of [...state.materials, ...surroundings.materials]) material.needsUpdate = true;
    renderer.shadowMap.needsUpdate = shadows;
    shadowDirty = true;
  }
  updateAboutFacts();
  invalidate();
}

function updateDaylight() {
  if (!daylight) return;
  const location = activeModel?.location;
  const enabled = Boolean($('daylight').checked && location);
  $('lighting-toggle').classList.toggle('daylight-active', enabled);
  $('lighting-state').textContent = enabled ? 'Sun and sky enabled' : 'Studio lighting';
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
    $('daylight-status').textContent = 'Choose a valid date between 1900 and 2100 to update daylight.';
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
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: location.timeZone, hour: '2-digit', minute: '2-digit' });
  const eventTime = value => value && Number.isFinite(value.getTime()) ? clock.format(value) : 'none';
  $('daylight-sun-times').textContent = `Sunrise ${eventTime(result.times.sunrise)} · Sunset ${eventTime(result.times.sunset)}`;
  const notes = [];
  if (result.adjusted) notes.push('This hour skips forward for daylight saving.');
  if (result.repeated) notes.push('Using the first occurrence of this repeated autumn hour.');
  if (state.mode === 'plan') notes.push('Sky is hidden in Floor plan.');
  $('daylight-status').textContent = notes.join(' ');
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
  walkCamera.updateProjectionMatrix();
  const halfHeight = orthographic.top;
  orthographic.left = -halfHeight * width / height;
  orthographic.right = halfHeight * width / height;
  orthographic.updateProjectionMatrix();
  invalidate();
}

// Fit building or Fit site. Fly and Walk return to Orbit in the same view first.
async function resetView(includeSurroundings = false) {
  if (!state.ready) return;
  pendingSiteView = false;
  if (state.mode === 'walk') await setMode(state.walkView);
  if (state.mode !== 'walk') frameView(includeSurroundings);
  invalidate();
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
  $('announcer').textContent = `${levelLabel()} · ${modeNames[displayMode()]}`;
  noteEmptyLevel();
}

// A level with nothing on it in this view would otherwise leave an unexplained empty screen.
function noteEmptyLevel() {
  const empty = state.level !== 'all' && !tree.loading && !tree.hidden.size && !tree.isolated && !state.meshes.some(mesh => mesh.visible);
  if (empty) notify(`Nothing is modelled on ${levelLabel()} in this view.`, 4000);
  else if (!$('notice').hidden && $('notice').textContent.startsWith('Nothing is modelled')) $('notice').hidden = true;
}

// ── Level picker ──

// Every published level, highest first; the picker is hidden for models without levels.
function levelChoices() {
  return orderedLevels(activeModel?.levels || [], activeLevels);
}

function renderLevelPicker() {
  const levels = levelChoices();
  $('level-picker').hidden = !levels.length;
  if (!levels.length) return;
  const plan = displayMode() === 'plan';
  $('level-current').textContent = levelLabel();
  $('level-toggle').title = `Level: ${levelLabel()}`;
  // In Floor plan one level is always shown; elsewhere a chosen level filters the model.
  $('level-toggle').dataset.filtered = String(state.level !== 'all' && !plan);
  const item = (level, label, note = '') => {
    const checked = state.level === level;
    return `<button class="menu-item level-item" role="menuitemradio" data-level="${escapeHTML(level)}" aria-checked="${checked}" tabindex="${checked ? 0 : -1}"${checked ? ' autofocus' : ''}${note ? ' disabled' : ''}>`
      + `${icon('i-check')}<span>${escapeHTML(label)}</span>${note ? `<span class="level-note">${note}</span>` : ''}</button>`;
  };
  const markup = item('all', 'All levels', plan ? 'Not in floor plan' : '')
    + '<span class="menu-divider" role="separator"></span>'
    + levels.map(level => item(level, activeLevels[level].label)).join('');
  // Interface updates are frequent; rebuilding an unchanged open menu would drop its focus.
  if (markup !== levelMenuMarkup) $('level-menu').innerHTML = levelMenuMarkup = markup;
}

function pickLevel(level) {
  closeDropdowns();
  if (level !== state.level) setLevel(level);
}

// Page Up and Page Down move through the picker's list: All levels, then top to bottom.
function stepLevel(direction) {
  if (!state.ready || !levelChoices().length) return;
  const next = adjacentLevel(state.level, direction, levelChoices(), displayMode() === 'plan');
  if (next !== state.level) setLevel(next);
}

async function loadMetadata() {
  try {
    const response = await fetch(new URL(activeModel.metadata, modelBase), { signal: assetAbort.signal });
    if (!response.ok) throw new Error(`Metadata request failed: ${response.status}`);
    const data = await response.json();
    if (data.modelId !== activeModel.id) throw new Error('Metadata belongs to a different model version.');
    metadata = parseMetadata(data, activeModel.levels);
    for (const issue of metadata.issues) console.warn(issue);
    renderPlaces();
    if (selectedElement) renderElementInfo(selectedElement);
  } catch (error) {
    if (assetAbort.signal.aborted) return;
    console.warn('Model annotations unavailable:', error);
    $('places-note').textContent = 'Saved places are unavailable. The views and the model tree still work.';
    $('places-note').hidden = false;
  }
}

async function loadBim() {
  if (!activeModel.bim) { buildTree(null); return; }
  try {
    const response = await fetch(new URL(activeModel.bim, modelBase), { signal: assetAbort.signal });
    if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
    const loaded = parseBimRegistry(await response.json(), state.meshes, activeModel);
    assetAbort.signal.throwIfAborted();
    bim = loaded;
    // A late optional registry must not silently change a selection already open.
    closeInspector();
    buildTree(bim);
  } catch (error) {
    if (assetAbort.signal.aborted) return;
    console.warn('Whole-object inventory unavailable:', error);
    buildTree(null);
  }
}

function elementDescription(mesh) { return describeProduct(mesh, bim) || describeElement(mesh, metadata); }

function fallbackCategory(mesh) {
  const value = describeElement(mesh, metadata).properties.find(p => p.label.toLowerCase() === 'category')?.value || 'unclassified';
  return value.toLowerCase().replace(/\s*\/\s*|\s+/g, '-');
}

// ── Places ──

function renderPlaces() {
  const groups = [['Saved views', metadata.views], ['Points of interest', metadata.pointsOfInterest]].filter(([, entries]) => entries.length);
  $('places-note').hidden = groups.length > 0;
  if (!groups.length && !state.ready) $('places-note').textContent = 'Loading saved places…';
  else if (!groups.length) $('places-note').textContent = 'This version has no saved places.';
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
  sidebar.dismiss();
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
    pendingSiteView = !surroundings.root;
    updateSurroundings();
    if (surroundings.root) frameView(true);
    else notify('Loading surroundings. The site view will open when ready.');
  } else if (view.frame) frameView();
  else {
    const control = state.mode === 'plan' ? plan : orbit;
    const saved = {
      position: new THREE.Vector3().fromArray(view.position), target: new THREE.Vector3().fromArray(view.target),
      zoom: 1, halfHeight: view.height / 2,
    };
    restoreView(saved, camera, control, canvas.clientWidth / canvas.clientHeight);
  }
  $('announcer').textContent = `${entry.title} · ${modeNames[state.mode]}`;
  invalidate();
}

// ── Model tree ──

function buildTree(registry, meshes = state.meshes) {
  const levels = (activeModel?.levels || []).filter(level => level !== 'all' && activeLevels[level]);
  tree.model = buildModelTree({ meshes, bim: registry, levels, definitions: activeLevels, category: fallbackCategory });
  tree.loading = meshes.length === 0;
  for (const set of [tree.expanded, tree.collapsedInFilter, tree.hidden]) set.clear();
  tree.isolated = null; tree.shown.clear(); tree.active = null; tree.hiddenMeshes = new Set();
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
    const name = escapeHTML(node.name);
    const labelState = node.kind === 'storey' ? ` aria-pressed="${focus}"` : node.kind === 'element' ? '' : ` aria-expanded="${open}"`;
    const hideTitle = by && by !== node ? (by === isolated ? 'Hidden by isolation' : `Hidden with ${escapeHTML(by.name)}`) : 'Show or hide';
    return `<li class="${classes}" data-id="${escapeHTML(node.id)}" data-open="${open}" style="--depth:${depth}">`
      + `<button class="tree-chevron${node.children.length ? '' : ' empty'}" data-action="toggle" tabindex="-1" aria-label="${open ? 'Collapse' : 'Expand'} ${name}">${icon('i-chevron')}</button>`
      + `<button class="tree-label" data-action="select" tabindex="-1" title="${name}"${labelState}><span class="tree-name">${name}</span></button>`
      + `<span class="tree-actions">`
      + `<button data-action="zoom" tabindex="-1" aria-label="Zoom to ${name}" title="Zoom to">${icon('i-full')}</button>`
      + `<button data-action="isolate" tabindex="-1" aria-pressed="${tree.isolated === node.id}" aria-label="Isolate ${name}" title="Isolate">${icon('i-isolate')}</button>`
      + `<button data-action="hide" tabindex="-1" aria-pressed="${Boolean(by)}" aria-label="${by ? 'Show' : 'Hide'} ${name}" title="${hideTitle}">${icon(by ? 'i-eye-off' : 'i-eye')}</button>`
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
        rows.push(`<li class="tree-row is-more" data-id="${escapeHTML(node.id)}" style="--depth:${depth + 1}"><span class="tree-chevron empty"></span><button class="tree-more" data-action="more" tabindex="-1">More…</button></li>`);
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
  const focused = list.contains(document.activeElement);
  list.innerHTML = rows.join('');
  const status = tree.loading ? 'Loading elements…'
    : filter && !rows.length ? 'No matching levels or elements.'
      : truncated ? 'Showing the first matches. Refine the filter to see more.' : '';
  $('tree-status').textContent = status;
  $('tree-status').hidden = !status;
  $('visibility-footer').hidden = !tree.hidden.size && !tree.isolated;
  const active = (tree.active && list.querySelector(`[data-id="${CSS.escape(tree.active)}"]:not(.is-more)`)) || list.querySelector('.tree-row');
  setActiveRow(active, focused);
}

// One tab stop for the tree: the active row's label and actions; arrows move between rows.
function setActiveRow(row, focus = false) {
  const list = $('model-tree');
  for (const button of list.querySelectorAll('[tabindex="0"]')) button.tabIndex = -1;
  if (!row) return;
  tree.active = row.dataset.id;
  for (const button of row.querySelectorAll('.tree-label, .tree-actions button, .tree-more')) button.tabIndex = 0;
  if (focus) (row.querySelector('.tree-label, .tree-more'))?.focus({ preventScroll: false });
}

function focusNode(node) {
  tree.active = node.id;
  const row = $('model-tree').querySelector(`[data-id="${CSS.escape(node.id)}"]:not(.is-more)`);
  if (row) { setActiveRow(row, true); row.scrollIntoView({ block: 'nearest' }); }
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
    notify(by === isolatedNode() ? 'Hidden by isolation. Choose Show all to see everything again.' : `Hidden with ${by.name}. Show it there first.`, 2600);
    return;
  }
  if (tree.hidden.delete(node.id)) $('announcer').textContent = `Showing ${node.name}`;
  else {
    tree.hidden.add(node.id);
    // Hiding a group makes the flags of its contents redundant.
    for (const element of elementsUnder(node)) for (let item = element; item && item !== node; item = item.parent) tree.hidden.delete(item.id);
    $('announcer').textContent = `Hidden ${node.name}`;
  }
  updateUserVisibility();
}

function toggleIsolate(node) {
  const on = tree.isolated !== node.id;
  tree.isolated = on ? node.id : null;
  notify(on ? `Isolated ${node.name}` : 'Isolation cleared', 1600);
  updateUserVisibility();
}

function showAll() {
  tree.hidden.clear(); tree.isolated = null;
  updateUserVisibility();
  $('announcer').textContent = 'All elements shown';
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
  notify(`Framing ${node.name}`, 1600);
  if (sidebar.isCompact()) sidebar.dismiss();
}

function selectFromTree(node) {
  if (!state.ready) return;
  revealLevel(node);
  if (sidebar.isCompact()) sidebar.dismiss();
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
  const row = $('model-tree').querySelector(`[data-id="${CSS.escape(node.id)}"]`);
  if (row) { setActiveRow(row, true); row.scrollIntoView({ block: 'center' }); }
}

function wireTree() {
  const list = $('model-tree');
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    const row = button?.closest('.tree-row');
    const node = row && tree.model.nodes.get(row.dataset.id);
    if (!node) return;
    // Focus the row in use, as keyboards do: touch screens reveal its Zoom to and Isolate
    // with it, and Safari does not focus a tapped button by itself.
    setActiveRow(row, true);
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
      case 'more': tree.shown.set(node.id, (tree.shown.get(node.id) || TREE_PAGE) + TREE_PAGE); renderTree(); break;
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
    if (target) { setActiveRow(target, true); target.scrollIntoView({ block: 'nearest' }); }
  });
  let filterTimer = 0;
  $('tree-filter').addEventListener('input', () => {
    $('clear-filter').hidden = !$('tree-filter').value;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
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
  const value = label => info.properties.find(p => p.label.toLowerCase() === label.toLowerCase())?.value;
  $('element-title').textContent = info.title;
  const category = node ? categoryOf(node)?.name : value('Category');
  $('element-subtitle').textContent = [category, node && storeyOf(node).level !== 'all' ? storeyOf(node).name : ''].filter(Boolean).join(' · ');
  // The summary holds the essentials; the details list the rest in the same grid, each
  // evidence text once. Inferred values carry a quiet tag with their confidence.
  const property = label => info.properties.find(p => p.label.toLowerCase() === label.toLowerCase());
  const shown = new Set([property('Category'), property('Primary storey')]);
  const row = (label, item, text = item.value) => {
    shown.add(item);
    return [label, text, item.basis === 'inferred' ? `Inferred · ${item.confidence} confidence` : ''];
  };
  const summary = [];
  const type = property('Type');
  if (type) { shown.add(type); if (cleanName(type.value) !== info.title) summary.push(row('Type', type, cleanName(type.value))); }
  const rooms = property('Rooms');
  if (rooms) summary.push(row('Room', rooms, rooms.value === 'Not assigned' ? rooms.value : rooms.value.split(/,\s*/).map(humanize).join(', ')));
  if (property('IFC class')) summary.push(row('Class', property('IFC class')));
  if (!summary.length && property('Placement')) summary.push(row('Placement', property('Placement'), humanize(property('Placement').value)));
  const extent = info.properties.find(p => p.basis === 'measured' && p.label.startsWith('Model extent'));
  if (summary.length < 2 && extent) summary.push(row('Size', extent));
  const facts = (list, rows) => list.replaceChildren(...rows.flatMap(([label, text, note, code]) => {
    const term = document.createElement('dt'); term.textContent = label;
    const definition = document.createElement('dd'); definition.textContent = text;
    if (code) definition.className = 'code';
    if (note) {
      const tag = document.createElement('span');
      tag.className = 'inferred'; tag.textContent = 'inferred'; tag.title = note;
      definition.append(' ', tag);
    }
    return [term, definition];
  }));
  facts($('element-summary'), summary);
  const details = info.properties.filter(p => !shown.has(p)).map(p => {
    const [label, text] = tidyProperty(p.label.startsWith('Model extent') ? 'Size' : p.label, p.value);
    return [...row(label, p, text), /\bID$/.test(label)];
  });
  if (info.sourceName && info.sourceName !== info.title) details.push(['Model name', info.sourceName]);
  details.push(['ID', info.id || 'None supplied', '', Boolean(info.id)]);
  facts($('element-properties'), details);
  const sources = [...new Set(info.properties.map(p => p.source).filter(Boolean))];
  $('element-source-list').replaceChildren(...sources.map(text => Object.assign(document.createElement('li'), { textContent: text })));
  $('element-sources').hidden = !sources.length;
  const visible = (bim?.members(mesh) || [mesh]).some(part => part.visible);
  $('element-visibility').hidden = visible;
  const hidden = node ? Boolean(hiddenBy(node, tree.hidden, isolatedNode())) : false;
  $('element-hide').setAttribute('aria-pressed', String(hidden));
  $('element-hide').querySelector('span').textContent = hidden ? 'Show' : 'Hide';
  $('element-hide').querySelector('use').setAttribute('href', hidden ? '#i-eye' : '#i-eye-off');
  $('element-hide').disabled = !node;
  $('element-reveal').disabled = !node;
  placeInspector();
}

function inspectElement(mesh, { point = null } = {}) {
  clearHighlight?.();
  const members = bim?.members(mesh) || [mesh];
  buildingInstances?.select(members);
  selectedElement = mesh;
  $('element-details').open = false;
  const bounds = bim?.bounds(mesh) || mesh.userData.bounds || new THREE.Box3().setFromObject(mesh);
  inspectorAnchor = point ? point.clone() : bounds.getCenter(new THREE.Vector3());
  $('inspector').hidden = false;
  renderElementInfo(mesh);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--color-selection').trim() || '#38d9ff';
  clearHighlight = bim?.product(mesh) ? highlightElements(members, color, scene, bim.bounds(mesh)) : highlightElement(mesh, color);
  renderTree();
  $('announcer').textContent = `Selected ${$('element-title').textContent}. Details are next to the element; Escape closes them.`;
  invalidate();
}

function closeInspector() {
  if ($('inspector').hidden) return;
  const hadFocus = $('inspector').contains(document.activeElement);
  $('inspector').hidden = true;
  $('pick-marker').hidden = true;
  clearHighlight?.(); clearHighlight = null; selectedElement = null; inspectorAnchor = null;
  buildingInstances?.select(null);
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
    for (const key of ['left', 'top', 'max-height']) panel.style.removeProperty(key);
    return;
  }
  const toolbar = document.querySelector('.toolbar').getBoundingClientRect();
  const controls = document.querySelector('.dock').getBoundingClientRect();
  const area = { left: 16, right: rect.width - 16, top: toolbar.bottom - rect.top + 12, bottom: controls.top - rect.top - 12 };
  // Short landscape screens: the details scroll so that the callout stays above the dock.
  panel.style.maxHeight = `${Math.max(160, area.bottom - area.top)}px`;
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

const sidebar = wireSidebar({ onChange: () => { if (renderer) resize(); placeInspector(); } });
const sidebarTabs = wirePanelTabs(document.querySelector('.sidebar-tabs'));

function wireControls() {
  // Touch devices with a system share sheet share the link there; others copy it.
  const share = touchPrimary.matches && typeof navigator.share === 'function';
  const shareLabel = share ? 'Share view link' : 'Copy view link';
  $('copy-view-link').querySelector('span').textContent = shareLabel;
  $('copy-view-link').addEventListener('click', async () => {
    if (!state.ready) return;
    syncViewURL();
    const url = currentViewLink().href;
    const button = $('copy-view-link');
    const label = button.querySelector('span');
    $('share-status').hidden = true;
    if (share) {
      try {
        await navigator.share({ title: document.title, url });
        closeDropdowns();
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return; // Dismissing the share sheet is not an error.
      }
    }
    button.disabled = true; label.textContent = 'Copying link…';
    let timeout;
    try {
      // Some embedded browsers leave clipboard permission pending indefinitely.
      await Promise.race([navigator.clipboard.writeText(url), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Clipboard unavailable')), 1500);
      })]);
      $('view-link-text').hidden = true;
      $('share-status').textContent = 'View link copied.';
    } catch {
      $('view-link-text').hidden = false;
      $('share-status').textContent = 'Copy the selected link below.';
      $('view-link-text').value = url;
      $('view-link-text').focus(); $('view-link-text').select();
    } finally {
      clearTimeout(timeout);
      button.disabled = !state.ready; label.textContent = shareLabel;
      $('share-status').hidden = false;
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
    const node = selectedElement && tree.model?.elementOf.get(selectedElement);
    if (node) zoomToNode(node);
    else if (selectedElement) frameBounds(bim?.bounds(selectedElement) || selectedElement.userData.bounds);
  });
  $('element-hide').addEventListener('click', () => {
    const node = selectedElement && tree.model?.elementOf.get(selectedElement);
    if (node) toggleHidden(node);
  });
  $('element-reveal').addEventListener('click', () => revealInTree(selectedElement && tree.model?.elementOf.get(selectedElement)));
  modeButtons.forEach(button => button.addEventListener('click', () => chooseView(button.dataset.mode)));
  navButtons.forEach(button => button.addEventListener('click', () => chooseNavigation(button.dataset.nav)));
  $('level-menu').addEventListener('click', event => {
    const item = event.target.closest('[data-level]');
    if (item && !item.disabled) pickLevel(item.dataset.level);
  });
  wireMenuKeys($('level-menu'));
  $('reset').addEventListener('click', () => resetView());
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
  });
  $('fit-surroundings').addEventListener('click', () => resetView(true));
  $('cut-height').addEventListener('input', () => {
    $('cut-value').textContent = `${Number($('cut-height').value).toFixed(1)} m`;
    setRangeDescription($('cut-height'), `${Number($('cut-height').value).toFixed(1)} meters above the selected floor`);
    applyVisibility();
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
    $('daylight').checked = false;
    $('brightness').value = '1';
    $('shadows').checked = STUDIO.shadows;
    const today = localParts(new Date(), activeModel.location?.timeZone);
    setDaylightDate(today.year, dayOfYear(today));
    daylightMinutes = 720;
    updateDaylight();
    $('daylight').focus({ preventScroll: true });
  });
  $('fullscreen').hidden = !document.fullscreenEnabled;
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('viewer').requestFullscreen();
    } catch { notify('Fullscreen is not available in this browser.'); }
  });
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').querySelector('span').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    resize();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('inspector').hidden && !event.target.closest?.('.dropdown, input, select')) { closeInspector(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target !== canvas) return;
    // In Fly and Walk, R sits beside E (rise); Fit building on the camera rail serves every mode.
    if (event.code === 'KeyR' && !event.repeat && state.mode !== 'walk') { event.preventDefault(); resetView(); }
    if (event.code === 'PageUp' || event.code === 'PageDown') {
      event.preventDefault();
      if (!event.repeat) stepLevel(event.code === 'PageUp' ? 1 : -1);
      return;
    }
    if (!isWalking()) {
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (directions[event.code] && state.mode !== 'walk') {
        event.preventDefault();
        const [horizontal, vertical] = directions[event.code];
        navigate({ horizontal, vertical, pan: event.shiftKey });
      }
      if (['Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract'].includes(event.code)) {
        event.preventDefault();
        navigate({ zoom: ['Minus', 'NumpadSubtract'].includes(event.code) ? 1.25 : 0.8 });
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
      buildingInstances?.dispose(); surroundings.instances?.dispose();
      surroundings.style?.setMuted(false); surroundings.style?.dispose();
      disposeAsset(model); disposeAsset(surroundings.root); disposeAsset(daylight?.sky);
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
  touchPrimary.addEventListener('change', resize);
  screen.orientation?.addEventListener('change', releaseMovement);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    frameLoop.stop();
    collisionAbort.abort();
    showError(new Error('The graphics connection was lost. Reload the viewer to continue.'));
  });
}

function render(time) {
  const delta = state.previousTime ? (time - state.previousTime) / 1000 : 0;
  state.previousTime = time;
  if (document.hidden) return;
  if (orbit.enabled && orbit.update()) invalidate();
  if (plan.enabled && plan.update()) invalidate();
  if (isWalking() && state.walker) {
    const message = state.walker.update(delta, keys);
    if (message) notify(message);
    invalidate();
  }
  if (state.dirty && (!model || state.presented)) {
    updateShadowFraming();
    renderScene();
    placeInspector();
    state.dirty = false;
  }
  return isWalking() && Boolean(state.walker);
}

$('retry').addEventListener('click', () => location.reload());
wireDropdowns();
setRangeDescription($('brightness'), '100 percent');
setRangeDescription($('cut-height'), '2.0 meters above the selected floor');
try { initialize(); } catch (error) { showError(error); }
