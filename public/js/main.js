import * as THREE from 'three';
import { loadGLB, paintOpportunity, prepareStaticModel, disposeAsset } from './asset-loader.js?v=gzip-5';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LEVELS, WALK_STARTS, visibleInMode } from './model-policy.js?v=top-floor-dollhouse-1';
import { Walker } from './walking.js?v=v019-galleries';
import { prepareCollisionWorld } from './collision-loader.js?v=v019-galleries';
import { captureView, restoreView, navigateView, settle, toPlan, fromPlan, copyPerspective } from './view-navigation.js?v=lens-2';
import { readViewURL, writeViewURL } from './view-url.js?v=entrance';
import { createRenderInstances } from './render-instances.js?v=bim-1';
import { openDialog, wireDialogs, wirePanelTabs, wireLightingDropdown, wireResponsiveLayout, closeLighting, setRangeDescription } from './interface.js?v=lighting-sheet-2';
import { createSurroundingsStyle } from './surroundings-style.js';
import { parseMetadata, describeElement } from './model-metadata.js?v=archive-levels-1';
import { wirePicking, highlightElement, highlightElements } from './inspection.js?v=bim-1';
import { parseBimRegistry, describeProduct } from './bim-registry.js';
import { parseCatalog, chooseModel } from './model-catalog.js?v=archive-levels-1';
import { Daylight } from './daylight.js?v=shadows-opt-in';
import { localParts, dayOfYear, daysInYear, calendarSelection, calendarDate } from './solar-time.js?v=calendar-2';
import { renderBudget } from './view-layout.js';
import { wireTouchWalk } from './touch-walk.js';
import { createFrameLoop } from './frame-loop.js';
import { fitDirectionalShadow, shadowCoverage } from './shadow-fit.js?v=lens-2';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const modeNames = { orbit: 'Exterior', dollhouse: 'Dollhouse', plan: 'Floor plan', walk: 'Walk' };
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const keys = new Set();
const state = { mode: 'dollhouse', level: 'all', ready: false, presented: false, dirty: true, meshes: [], materials: new Set(), walker: null, collision: null, hasWalked: false, touchWalking: false, modeRequest: 0, previousTime: 0, noticeTimer: 0 };
let renderer, scene, camera, perspective, walkCamera, orthographic, orbit, plan, pointer, sun, fillLight, model, daylight, environmentTarget;
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
const walkingSupported = typeof canvas.requestPointerLock === 'function' && matchMedia('(any-pointer: fine)').matches;
const touchPrimary = matchMedia('(pointer: coarse)');
let touchWalk;
let metadata = { views: [], pointsOfInterest: [], objects: new Map() };
let bim = null;
let elementSearchCache = new WeakMap();
let clearHighlight = null;
let selectedElement = null;
let pendingSiteView = false;
const modelBase = new URL('../models/', import.meta.url);
let activeModel = null;
let activeLevels = LEVELS;
const diagnostics = new URL(location.href).searchParams.has('stats');

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
$('walk-input').value = touchPrimary.matches || !walkingSupported ? 'touch' : 'mouse';
$('walk-input').querySelector('[value="mouse"]').disabled = !walkingSupported;
try {
  const quality = localStorage.getItem('building-viewer:quality');
  if (['auto', 'high', 'low'].includes(quality)) $('render-quality').value = quality;
} catch { /* Use automatic quality when storage is unavailable. */ }

function showError(error) {
  console.error(error);
  state.ready = false;
  state.presented = false;
  assetAbort.abort(error);
  collisionAbort.abort(error);
  frameLoop?.stop();
  modeButtons.forEach(button => { button.disabled = true; });
  for (const id of ['zoom-in', 'zoom-out', 'reset', 'settings-toggle', 'lighting-toggle', 'copy-view-link']) $(id).disabled = true;
  closeLighting();
  pauseWalk();
  $('walk-panel').hidden = true;
  $('section-controls').hidden = true;
  $('camera-tools').hidden = true;
  $('walk-hud').hidden = true;
  $('crosshair').hidden = true;
  document.body.classList.remove('walking');
  $('loading').hidden = false;
  $('loading-title').textContent = 'Unable to open the viewer';
  $('loading-detail').textContent = location.protocol === 'file:'
    ? 'Start the local server with “python scripts/serve.py”, then open http://localhost:8000.'
    : /fetch|404|not found/i.test(error.message || '')
      ? 'The building file could not be loaded. Check that the local server is running and this version has been imported, then try again or choose another version.'
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
  $('floor').value = state.level;
  $('cut-height').value = String(view.cut);
  $('cut-value').textContent = `${view.cut.toFixed(1)} m`;
  setRangeDescription($('cut-height'), `${view.cut.toFixed(1)} meters above the selected floor`);
  if (view.surroundings !== undefined) $('surroundings').checked = view.surroundings;
  if (view.muted !== undefined) $('muted-surroundings').checked = view.muted;
  camera = view.mode === 'plan' ? orthographic : view.mode === 'walk' ? walkCamera : perspective;
  orbit.enabled = ['orbit', 'dollhouse'].includes(view.mode); plan.enabled = view.mode === 'plan';
  pointer.enabled = view.mode === 'walk';
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
function notify(message) {
  clearTimeout(state.noticeTimer);
  $('notice').textContent = message;
  $('notice').hidden = false;
  state.noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 5500);
}

function initialize() {
  if (location.protocol === 'file:') throw new Error('A local HTTP server is required.');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: touchPrimary.matches ? 'default' : 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;
  renderer.info.autoReset = !diagnostics;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  environmentTarget = pmrem.fromScene(environment, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.8;
  environment.dispose();
  pmrem.dispose();
  fillLight = new THREE.HemisphereLight(0xe8edff, 0x9c866b, 1.6);
  scene.add(fillLight);
  sun = new THREE.DirectionalLight(0xfff4e1, 2.5);
  sun.castShadow = false;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 260 });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.00008;
  sun.target.position.set(0, 10, 0);
  scene.add(sun, sun.target);
  setSun(135);
  daylight = new Daylight({ scene, sun, fillLight, renderer, bounds: shadowBounds });
  const today = localParts(new Date());
  // Fresh visits always start in studio lighting, even if the browser restores forms.
  $('daylight').checked = false;
  $('shadows').checked = false;
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
  pointer = new PointerLockControls(walkCamera, canvas);
  pointer.enabled = false;
  pointer.pointerSpeed = 0.75;
  pointer.addEventListener('change', invalidate);
  pointer.addEventListener('lock', () => {
    if (state.mode !== 'walk') { pointer.unlock(); return; }
    setWalkingActive(true);
  });
  pointer.addEventListener('unlock', () => {
    setWalkingActive(false);
  });
  document.addEventListener('pointerlockerror', () => {
    $('walk-message').textContent = 'Mouse capture was unavailable. Try Enter again, or choose Touch controls to drag the view and use the movement pad.';
    $('walk-panel').hidden = false;
  });
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
    if (!response.ok) throw new Error('The model versions list could not be loaded. Refresh after importing the models.');
    const models = parseCatalog(await response.json());
    const requested = new URL(location.href).searchParams.get('version');
    activeModel = chooseModel(models, requested);
    activeLevels = activeModel.levelDefinitions || LEVELS;
    $('model-version').replaceChildren(...models.map((model, index) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.label}${index === 0 ? ' · Latest' : ''}`;
      return option;
    }));
    $('model-version').value = activeModel.id;
    $('model-version').disabled = false;
    updateModelSummary();
    $('daylight').disabled = !activeModel.location;
    document.title = `Bundeshaus ${activeModel.label} · Building explorer`;
    $('loading-title').textContent = `Opening Bundeshaus · ${activeModel.label}`;
    $('floor').replaceChildren(...activeModel.levels.map(id => new Option(id === 'all' ? 'All levels' : activeLevels[id].label, id)));
    if (requested && activeModel.id !== requested) notify('That version is unavailable. Opened the latest imported model.');
    loadMetadata();
    loadModel();
  } catch (error) { if (!assetAbort.signal.aborted) showError(error); }
}

function switchVersion(id) {
  if (!activeModel || id === activeModel.id) return;
  // Reloading releases the previous model and its GPU textures, avoiding stale
  // async loads and accumulated memory when comparing many large iterations.
  try {
    if (state.ready && state.mode !== 'walk') {
      const saved = captureView(camera, state.mode === 'plan' ? plan : orbit, state.level);
      sessionStorage.setItem('building-viewer:comparison', JSON.stringify({
        destination: id, mode: state.mode, level: state.level, cutHeight: Number($('cut-height').value),
        position: saved.position.toArray(), target: saved.target.toArray(), zoom: saved.zoom, halfHeight: saved.halfHeight,
        lighting: { enabled: $('daylight').checked, ...calendarSelection($('daylight-date').value), minutes: Number($('daylight-time').value), shadows: $('shadows').checked, brightness: Number($('brightness').value) },
      }));
    } else sessionStorage.removeItem('building-viewer:comparison');
  } catch { /* Version switching still works if storage is disabled. */ }
  syncViewURL();
  const url = new URL(location.href);
  url.searchParams.set('version', id);
  location.assign(url.href);
}

function restoreComparison() {
  try {
    const value = sessionStorage.getItem('building-viewer:comparison');
    sessionStorage.removeItem('building-viewer:comparison');
    if (!value) return false;
    const saved = JSON.parse(value);
    const validVector = vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite);
    if (saved.destination !== activeModel.id || !['orbit', 'dollhouse', 'plan'].includes(saved.mode)
      || !activeModel.levels.includes(saved.level) || (saved.mode === 'plan' && saved.level === 'all')
      || !validVector(saved.position) || !validVector(saved.target) || !(saved.zoom > 0)
      || (saved.mode === 'plan' && !(saved.halfHeight > 0))) return false;
    state.mode = saved.mode;
    state.level = saved.level;
    camera = state.mode === 'plan' ? orthographic : perspective;
    orbit.enabled = state.mode !== 'plan';
    plan.enabled = state.mode === 'plan';
    $('floor').value = state.level;
    if (saved.lighting) {
      $('daylight').checked = Boolean(saved.lighting.enabled && activeModel.location);
      setDaylightDate(Math.round(THREE.MathUtils.clamp(saved.lighting.year || 2026, 1900, 2100)), saved.lighting.day || 1);
      $('daylight-time').value = String(saved.lighting.minutes || 0);
      $('shadows').checked = Boolean(saved.lighting.shadows);
      $('brightness').value = String(saved.lighting.brightness || 1);
      applyLightingAppearance();
    }
    if (Number.isFinite(saved.cutHeight)) {
      $('cut-height').value = String(THREE.MathUtils.clamp(saved.cutHeight, 0.5, 8));
      $('cut-height').dispatchEvent(new Event('input'));
    }
    restoreView({ ...saved, position: new THREE.Vector3().fromArray(saved.position), target: new THREE.Vector3().fromArray(saved.target) }, camera, state.mode === 'plan' ? plan : orbit, canvas.clientWidth / canvas.clientHeight);
    return true;
  } catch { return false; }
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
    const comparisonRestored = restoreComparison();
    const linkRestored = restoreLink();
    applyVisibility();
    if (linkRestored === false || (!linkRestored && !comparisonRestored)) {
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
    renderElementSearch();
    renderPlaces();
    loadBim();
    modeButtons.forEach(button => { button.disabled = false; });
    for (const id of ['reset', 'zoom-in', 'zoom-out', 'surroundings', 'lighting-toggle', 'copy-view-link']) $(id).disabled = false;
    updateInterface();
    if (state.mode === 'walk') prepareWalk(++state.modeRequest);
    // Give the actual building a paint opportunity before optional context work.
    paintOpportunity(signal).then(updateSurroundings).catch(() => {});
    $('announcer').textContent = `Bundeshaus ${activeModel.label} is ready. ${modeNames[state.mode]}. Open Help for navigation controls.`;
    invalidate();
  } catch (error) {
    buildingInstances?.dispose(); buildingInstances = null;
    disposeAsset(pendingRoot);
    if (!assetAbort.signal.aborted) showError(error);
  }
}

function applyVisibility() {
  const section = activeLevels[state.level];
  const clip = Boolean(section && (state.mode === 'plan' || state.mode === 'dollhouse'));
  if (clip) {
    cutPlanes[0].constant = state.mode === 'plan' ? section.elevation + Number($('cut-height').value) : section.max;
    cutPlanes[1].constant = -section.min;
  }
  for (const mesh of state.meshes) mesh.visible = visibleInMode(mesh, state.mode, state.level, activeLevels);
  clearHighlight?.syncVisibility?.();
  buildingInstances?.sync();
  for (const material of state.materials) {
    const wasClipped = Boolean(material.clippingPlanes?.length);
    material.clippingPlanes = clip ? cutPlanes : null;
    if (wasClipped !== clip) material.needsUpdate = true;
  }
  refreshShadowBounds();
  if ($('daylight').checked) updateDaylight();
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
  $('fit-surroundings').hidden = !visible || !surroundings.root || state.mode === 'walk';
  $('retry-surroundings').hidden = !surroundings.error;
  $('surroundings-status').textContent = surroundings.error
    || (enabled && state.mode === 'plan' ? 'Paused in floor plan'
      : enabled && surroundings.loading ? (surroundings.phase !== 'download' ? 'Preparing surroundings…' : surroundings.progress === null ? 'Starting surroundings download…' : `Downloading surroundings · ${surroundings.progress}%`)
        : enabled && !surroundings.root ? 'Shown after the building loads'
          : enabled ? ($('muted-surroundings').checked ? 'On · Muted grey' : 'On · Original colors') : 'Off · Building only');
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
    surroundings.error = 'Surroundings unavailable';
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
  if (section && (state.mode === 'plan' || state.mode === 'dollhouse')) {
    bounds.min.y = section.min;
    bounds.max.y = state.mode === 'plan' ? section.elevation + Number($('cut-height').value) : section.max;
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

async function setMode(mode) {
  if (!state.ready || mode === state.mode) return;
  const request = ++state.modeRequest;
  pendingSiteView = false;
  const previous = state.mode;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  if (previous !== 'walk') settle(previous === 'plan' ? plan : orbit);
  pauseWalk();
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
  } else if (mode === 'walk') copyPerspective(perspective, walkCamera);
  state.mode = mode;
  keys.clear();
  camera = mode === 'plan' ? orthographic : mode === 'walk' ? walkCamera : perspective;
  orbit.enabled = mode === 'orbit' || mode === 'dollhouse';
  plan.enabled = mode === 'plan';
  pointer.enabled = mode === 'walk';
  if (mode === 'plan' && state.level === 'all') state.level = 'principal';
  $('floor').value = state.level;
  if (mode === 'plan' || (mode === 'dollhouse' && !matchMedia('(max-width: 760px), (max-height: 500px)').matches)) $('model-tools').open = true;
  applyVisibility();
  updateInterface();
  if (mode === 'walk') {
    await prepareWalk(request);
    if (state.mode !== mode || request !== state.modeRequest || !state.ready) return;
  }
  $('announcer').textContent = modeNames[mode] + (['plan', 'dollhouse'].includes(mode) ? ` · ${$('floor').selectedOptions[0].textContent}` : '');
  invalidate();
}

async function prepareWalk(request) {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('enter-walk').disabled = true;
  $('walk-message').textContent = 'Preparing walking surfaces…';
  if (!state.collision) {
    try {
      collisionPromise ||= prepareCollisionWorld(state.meshes, collisionAbort.signal).then(result => {
        state.collision = result;
        state.walker = new Walker(walkCamera, result.world);
      }).catch(error => { collisionPromise = null; throw error; });
      await collisionPromise;
    } catch (error) {
      if (state.mode !== 'walk' || request !== state.modeRequest || !state.ready) return;
      console.error(error);
      $('walk-message').textContent = error.message || 'Walking surfaces could not be prepared. Switch to Exterior or Dollhouse and try again.';
      return;
    }
  }
  // Changing modes during preparation must never restore a stale walk panel.
  if (state.mode !== 'walk' || request !== state.modeRequest || !state.ready) return;
  // Preserve this camera, including shared links. A viewpoint above the floor
  // starts paused in Fly; choosing a room remains an explicit teleport.
  state.walker.adoptView();
  $('fly').checked = state.walker.flying;
  $('fly-hint').hidden = !state.walker.flying;
  state.hasWalked = true;
  updateWalkPanel();
  $('enter-walk').disabled = !state.walker.hasPosition;
  if (state.walker.hasPosition) $('walk-message').textContent = state.walker.flying
    ? 'Your viewpoint is preserved. Fly from here, or choose a room to walk at floor level.'
    : 'Your viewpoint is preserved. Resume to explore from here.';
  $('enter-walk').focus({ preventScroll: true });
  invalidate();
}

function updateInterface() {
  const mode = state.mode;
  $('viewer').dataset.viewMode = mode;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  $('mode-label').textContent = modeNames[mode];
  $('section-controls').hidden = !state.ready || !['dollhouse', 'plan'].includes(mode);
  $('cut-control').hidden = mode !== 'plan';
  $('floor').querySelector('[value="all"]').disabled = mode === 'plan';
  $('walk-panel').hidden = mode !== 'walk' || isWalking();
  $('crosshair').hidden = !isWalking();
  $('camera-tools').hidden = mode === 'walk';
  const hints = mode === 'walk' ? ['WASD to move · mouse to look', 'Esc to release · R to reset'] : mode === 'plan' ? ['Drag to pan', 'Scroll to zoom'] : ['Drag to orbit · right-drag to pan', 'Scroll to zoom'];
  $('navigation-hint').replaceChildren(...hints.map(text => { const span = document.createElement('span'); span.textContent = text; return span; }));
  canvas.setAttribute('aria-label', mode === 'plan' ? 'Building floor plan. Drag to pan and pinch or scroll to zoom.' : mode === 'walk' ? 'First person building view. Start walking with touch controls or keyboard and mouse.' : '3D building. Drag to orbit; pinch or scroll to zoom.');
  $('canvas-help').textContent = mode === 'walk'
    ? 'Start walking with the selected controls. With touch controls, hold the direction buttons and drag the view to look. With a mouse, WASD or arrows move and Space jumps. Escape or Pause stops walking; R returns to the chosen room.'
    : `With the viewer focused: ${mode === 'plan' ? 'arrow keys pan' : 'arrow keys rotate, Shift and arrows pan'}, plus and minus zoom, R fits the building. H opens Help. Tab moves to the controls.`;
  updateWalkPanel();
  updateSurroundings();
  updateDaylight();
  updateModelSummary();
}

function updateModelSummary() {
  const floor = ['plan', 'dollhouse'].includes(state.mode) ? $('floor').selectedOptions[0]?.textContent : '';
  $('model-summary').textContent = [activeModel?.label || 'Loading versions', floor].filter(Boolean).join(' · ');
}

function isWalking() { return Boolean(pointer?.isLocked || state.touchWalking); }

function setWalkingActive(active, touch = false) {
  state.touchWalking = active && touch;
  touchWalk?.setActive(state.touchWalking);
  keys.clear();
  if (state.walker) state.walker.velocity.set(0, 0, 0);
  $('walk-panel').hidden = state.mode !== 'walk' || active;
  $('crosshair').hidden = !active;
  $('walk-hud').hidden = !active;
  $('touch-walk').hidden = !state.touchWalking;
  $('walk-exit-hint').hidden = state.touchWalking;
  document.body.classList.toggle('walking', active);
  document.body.classList.toggle('touch-walking', state.touchWalking);
  if (active) { state.hasWalked = true; canvas.focus({ preventScroll: true }); }
  else if (state.mode === 'walk') $('enter-walk').focus({ preventScroll: true });
  state.previousTime = performance.now();
  updateWalkPanel();
  invalidate();
}

function pauseWalk() {
  if (pointer?.isLocked) pointer.unlock();
  else if (state.touchWalking) setWalkingActive(false);
  keys.clear();
}

function updateWalkPanel() {
  const resume = state.hasWalked && state.walker?.hasPosition;
  $('walk-heading').textContent = resume ? 'Walk paused' : 'Step inside';
  $('walk-intro').textContent = resume ? 'Continue here, or jump to another room.' : 'Choose a room to begin.';
  $('enter-walk').innerHTML = `${resume ? 'Resume walk' : 'Enter building'} <svg aria-hidden="true"><use href="#i-chevron"/></svg>`;
  const touch = $('walk-input').value === 'touch';
  $('walk-instructions').textContent = touch
    ? 'Hold the direction buttons to move. Drag the building view to look around. Tap Pause to return here.'
    : 'WASD or arrows move · mouse looks · Shift speeds up · Space jumps · Esc pauses.';
  const returnHint = state.walker?.hasSafePosition ? 'Turn off to return to your last safe walking position.' : 'Choose a room, or turn off to start in the Dome hall.';
  $('fly-hint').textContent = `Pass through walls. ${touch ? 'Use Rise and Descend.' : 'E rises, Q descends.'} ${returnHint}`;
  $('walk-state').textContent = $('fly').checked ? 'Flying' : 'Walking';
  $('touch-jump').hidden = $('fly').checked;
  $('touch-fly').hidden = !$('fly').checked;
}

function setWalkStart() {
  if (!state.walker) return;
  const start = WALK_STARTS[$('walk-start').value] || WALK_STARTS.hall;
  const placed = state.walker.spawn(start.position, start.target);
  if (!placed) {
    state.walker.hasPosition = false;
    $('walk-message').textContent = 'No clear walking start here. Choose another room.';
  }
  $('fly').checked = false;
  $('fly-hint').hidden = true;
  state.walker.setFlying(false);
  state.hasWalked = isWalking();
  $('enter-walk').disabled = !placed;
  if (placed) $('walk-message').textContent = 'Some connections are unfinished. Enable Fly to explore beyond them.';
  updateWalkPanel();
  invalidate();
}

function setSun(degrees) {
  const radians = THREE.MathUtils.degToRad(degrees);
  sun.target.position.set(0, 10, 0);
  sun.position.set(Math.sin(radians) * 85, 110, Math.cos(radians) * 85);
  shadowDirty = true;
  renderer.shadowMap.needsUpdate = true;
  invalidate();
}

function setDaylightDate(year, day) {
  $('daylight-date').value = calendarDate(year, day);
  $('daylight-day').max = daysInYear(year);
  $('daylight-day').value = String(day);
}

function applyLightingAppearance() {
  const enabled = Boolean($('daylight').checked && activeModel?.location);
  // Hidden daylight preferences must not change the studio's default appearance.
  renderer.toneMappingExposure = enabled ? Number($('brightness').value) : 1;
  $('brightness-value').textContent = Number($('brightness').value).toFixed(1);
  setRangeDescription($('brightness'), `${Math.round(Number($('brightness').value) * 100)} percent`);
  const shadows = enabled && $('shadows').checked;
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    for (const material of [...state.materials, ...surroundings.materials]) material.needsUpdate = true;
    renderer.shadowMap.needsUpdate = shadows;
    shadowDirty = true;
  }
  invalidate();
}

function updateDaylight() {
  if (!daylight) return;
  const location = activeModel?.location;
  const enabled = Boolean($('daylight').checked && location);
  $('lighting-toggle').classList.toggle('daylight-active', enabled);
  $('lighting-state').textContent = enabled ? 'Sun and sky enabled' : 'Studio lighting';
  $('daylight-options').hidden = !enabled;
  $('daylight-description').textContent = location
    ? enabled ? 'Date and time set the sun’s direction. Times are local to Bern.'
      : 'Studio lighting is on. Enable Sun & sky to explore daylight in Bern.'
    : 'Daylight needs a location and north orientation for this model.';
  applyLightingAppearance();
  if (!enabled) {
    daylight.update({ enabled: false });
    setSun(135);
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
  const minutes = Number($('daylight-time').value);
  const result = daylight.update({ enabled, showSky: state.mode !== 'plan', year, day, minutes, location });
  const actual = localParts(result.date, location.timeZone);
  // The skipped spring hour is visibly advanced to a real local time.
  if (result.adjusted) $('daylight-time').value = actual.hour * 60 + actual.minute;
  $('daylight-hour').value = `${String(actual.hour).padStart(2, '0')}:${String(actual.minute).padStart(2, '0')}`;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: location.timeZone, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: location.timeZone, day: 'numeric', month: 'short', year: 'numeric' });
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: location.timeZone, hour: '2-digit', minute: '2-digit' });
  $('daylight-time-value').textContent = time.format(result.date);
  $('daylight-date-value').textContent = date.format(result.date);
  setRangeDescription($('daylight-time'), `${time.format(result.date)}, Bern local time`);
  setRangeDescription($('daylight-day'), date.format(result.date));
  const eventTime = value => value && Number.isFinite(value.getTime()) ? clock.format(value) : 'none';
  $('daylight-sun-times').textContent = `Sunrise ${eventTime(result.times.sunrise)} · Sunset ${eventTime(result.times.sunset)}`;
  $('daylight-direction').textContent = `Sun direction ${Math.round(result.azimuth)}° from north · ${Math.abs(result.altitude).toFixed(1)}° ${result.altitude >= 0 ? 'above' : 'below'} the horizon.`;
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
  const budget = renderBudget({ width, height, dpr: devicePixelRatio, touch: touchPrimary.matches, quality: $('render-quality').value });
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

function resetView() {
  if (!state.ready) return;
  pendingSiteView = false;
  if (state.mode === 'walk') { setWalkStart(); keys.clear(); }
  else frameView();
  invalidate();
}

function navigate(action) {
  if (!state.ready || state.mode === 'walk') return;
  navigateView(camera, state.mode === 'plan' ? plan : orbit, action);
  invalidate();
}

async function loadMetadata() {
  try {
    const response = await fetch(new URL(activeModel.metadata, modelBase), { signal: assetAbort.signal });
    if (!response.ok) throw new Error(`Metadata request failed: ${response.status}`);
    const data = await response.json();
    if (data.modelId !== activeModel.id) throw new Error('Metadata belongs to a different model version.');
    metadata = parseMetadata(data, activeModel.levels);
    elementSearchCache = new WeakMap();
    for (const issue of metadata.issues) console.warn(issue);
    $('explore-note').textContent = 'Choose a saved view or a place to look around.';
    renderPlaces();
    renderElementSearch();
    if (selectedElement) renderElementInfo(selectedElement);
  } catch (error) {
    if (assetAbort.signal.aborted) return;
    console.warn('Model annotations unavailable:', error);
    $('explore-note').textContent = 'Saved places are unavailable. The four viewing modes and element search still work.';
  }
}

async function loadBim() {
  if (!activeModel.bim) return;
  $('inventory-status').textContent = 'Loading whole-object inventory…';
  try {
    const response = await fetch(new URL(activeModel.bim, modelBase), { signal: assetAbort.signal });
    if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
    const loaded = parseBimRegistry(await response.json(), state.meshes, activeModel);
    assetAbort.signal.throwIfAborted();
    bim = loaded; elementSearchCache = new WeakMap();
    $('inventory-status').textContent = `${bim.elements.size} registered products. Counts include hidden objects. Unreviewed building quantities remain unknown.`;
    const rows = [];
    for (const c of bim.counts) {
      const term = document.createElement('dt'); term.textContent = c.category.replaceAll('-', ' ');
      const value = document.createElement('dd'); value.textContent = `${c.count} ${c.status === 'partial' ? '· registered subset' : '· modeled inventory'}`;
      rows.push(term, value);
      if (c.category === 'window') for (const [key, area] of Object.entries(c.areas)) {
        const label = document.createElement('dt'); label.textContent = { openingArea: 'Opening area', outerFrameArea: 'Outer-frame projected area', netGlazingArea: 'Net glazing area', floorArea: 'Modeled floor footprint (sum)' }[key];
        const detail = document.createElement('dd'); detail.textContent = area.value === null ? 'Unknown'
          : `${area.value.toFixed(3)} m² · ${area.known} of ${area.registered} registered windows; whole-building total unknown`;
        rows.push(label, detail);
      }
    }
    $('inventory-values').replaceChildren(...rows);
    $('inventory-download').hidden = false;
    renderElementSearch();
    // A late optional registry must not silently change a selection already open.
    if (selectedElement) { clearHighlight?.(); buildingInstances?.select(null); selectedElement = null; $('inspector').close(); }
  } catch (error) {
    if (assetAbort.signal.aborted) return;
    console.warn('Whole-object inventory unavailable:', error);
    $('inventory-status').textContent = 'Whole-object inventory could not be validated. Individual model components remain available.';
  }
}

function elementDescription(mesh) { return describeProduct(mesh, bim) || describeElement(mesh, metadata); }

function placeButton(title, description, action, icon = 'i-chevron') {
  const button = document.createElement('button');
  button.className = 'place-button';
  const graphic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  graphic.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${icon}`); graphic.append(use);
  const copy = document.createElement('span'); copy.className = 'place-copy';
  const label = document.createElement('strong');
  label.textContent = title;
  copy.append(label);
  if (description) {
    const detail = document.createElement('span'); detail.className = 'place-description';
    detail.textContent = description;
    copy.append(detail);
  }
  button.append(graphic, copy);
  button.disabled = !state.ready;
  button.addEventListener('click', action);
  return button;
}

function renderPlaces() {
  for (const [id, entries] of [['saved-views', metadata.views], ['places-list', metadata.pointsOfInterest]]) {
    $(id).replaceChildren(...entries.map(entry => placeButton(entry.title, entry.description, () => visitPlace(entry), { orbit: 'i-cube', dollhouse: 'i-dollhouse', plan: 'i-plan' }[entry.camera.mode])));
  }
}

async function visitPlace(entry) {
  if (!state.ready) return;
  $('explore').close();
  pendingSiteView = false;
  const view = entry.camera;
  await setMode(view.mode);
  state.level = view.level || 'all';
  $('floor').value = state.level;
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

function renderElementSearch() {
  const query = $('element-search').value.trim().toLowerCase();
  $('clear-element-search').hidden = !$('element-search').value;
  if (!state.ready) return;
  if (!query) {
    $('element-count').textContent = bim ? `Search ${bim.elements.size} products and ${bim.data.unresolvedComponents.length} unreviewed components.` : `Search ${state.meshes.length} building components by name or category.`;
    $('element-list').replaceChildren();
    return;
  }
  const words = query.split(/\s+/), matches = [];
  for (const mesh of bim?.representatives || state.meshes) {
    let entry = elementSearchCache.get(mesh);
    if (!entry) {
      const info = elementDescription(mesh);
      entry = { mesh, info, searchable: [info.title, info.sourceName, ...info.properties.map(p => p.value)].join(' ').toLowerCase() };
      elementSearchCache.set(mesh, entry);
    }
    if (words.every(word => entry.searchable.includes(word))) matches.push(entry);
  }
  const shown = matches.slice(0, 40);
  $('element-count').textContent = !matches.length ? 'No matching elements. Try a shorter name or another category.'
    : matches.length > 40 ? `${matches.length} matches. Showing the first 40; refine your search.` : `${matches.length} ${matches.length === 1 ? 'element' : 'elements'} found.`;
  $('element-list').replaceChildren(...shown.map(({ mesh, info }) => {
    const visible = (bim?.members(mesh) || [mesh]).some(part => part.visible);
    const button = placeButton(info.title, [info.properties.find(p => p.label.toLowerCase() === 'category')?.value, visible ? '' : 'Hidden in this view'].filter(Boolean).join(' · '),
      () => { $('explore').close(); inspectElement(mesh, button); });
    return button;
  }));
}

function renderElementInfo(mesh) {
  const info = elementDescription(mesh);
  $('element-title').textContent = info.title;
  $('element-source').textContent = info.sourceName;
  $('element-id').textContent = info.id || 'No stable element ID supplied';
  const visible = (bim?.members(mesh) || [mesh]).some(part => part.visible);
  $('element-visibility').hidden = visible;
  $('selection-key').hidden = !visible;
  const rows = [];
  const sources = new Map();
  for (const property of info.properties) {
    const term = document.createElement('dt');
    term.textContent = property.label;
    const definition = document.createElement('dd');
    const value = document.createElement('span'); value.textContent = property.value;
    const basis = document.createElement('span'); basis.className = 'property-basis';
    basis.dataset.basis = property.basis;
    basis.textContent = property.basis === 'inferred' ? `Inferred · ${property.confidence} confidence`
      : property.basis === 'measured' ? 'Measured from model' : 'Provided by model author';
    definition.append(value, basis);
    if (property.source) {
      if (!sources.has(property.source)) sources.set(property.source, new Set());
      sources.get(property.source).add(property.label);
    }
    rows.push(term, definition);
  }
  $('element-properties').replaceChildren(...rows);
  const sourceRows = [];
  for (const [source, labels] of sources) {
    const term = document.createElement('dt'); term.textContent = [...labels].join(' · ');
    const definition = document.createElement('dd'); definition.textContent = source;
    sourceRows.push(term, definition);
  }
  $('element-source-list').replaceChildren(...sourceRows);
  $('element-sources').hidden = sources.size === 0;
}

function inspectElement(mesh, invoker = canvas) {
  clearHighlight?.();
  const members = bim?.members(mesh) || [mesh];
  buildingInstances?.select(members);
  selectedElement = mesh;
  $('element-sources').open = false;
  const fromResults = Boolean(invoker.closest?.('#element-list'));
  $('element-back').hidden = !fromResults;
  $('inspector').returnResult = fromResults ? invoker : null;
  renderElementInfo(mesh);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--color-selection').trim() || '#38d9ff';
  clearHighlight = bim?.product(mesh) ? highlightElements(members, color, scene, bim.bounds(mesh)) : highlightElement(mesh, color);
  openDialog($('inspector'), fromResults ? $('explore-toggle') : invoker);
  invalidate();
}

function wireControls() {
  $('inventory-download').addEventListener('click', () => {
    if (!bim) return;
    const data = { modelId: bim.data.modelId, sourceSha256: bim.data.sourceSha256, scope: 'Registered modeled products; independent of current visibility', counts: bim.counts, caveats: bim.data.caveats };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${bim.data.modelId}-inventory.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('copy-view-link').addEventListener('click', async () => {
    if (!state.ready) return;
    syncViewURL();
    const url = currentViewLink().href;
    const button = $('copy-view-link');
    button.disabled = true; button.textContent = 'Copying link…';
    $('share-status').hidden = true;
    let timeout;
    try {
      // Some embedded browsers leave clipboard permission pending indefinitely.
      await Promise.race([navigator.clipboard.writeText(url), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Clipboard unavailable')), 1500);
      })]);
      $('view-link-fallback').hidden = true;
      $('share-status').textContent = 'View link copied.';
    } catch {
      $('view-link-fallback').hidden = false;
      $('share-status').textContent = 'Copy the selected link below.';
      $('view-link-text').value = url;
      if ($('settings').open) { $('view-link-text').focus(); $('view-link-text').select(); }
    } finally {
      clearTimeout(timeout);
      button.disabled = !state.ready; button.textContent = 'Copy view link';
      $('share-status').hidden = false;
    }
  });
  wirePanelTabs(document.querySelector('.panel-tabs'));
  touchWalk = wireTouchWalk({ canvas, buttons: document.querySelectorAll('[data-walk-key]'), camera: walkCamera, keys, invalidate });
  $('pause-walk').addEventListener('click', pauseWalk);
  $('walk-input').addEventListener('change', updateWalkPanel);
  $('render-quality').addEventListener('change', () => {
    try { localStorage.setItem('building-viewer:quality', $('render-quality').value); } catch { /* Rendering still updates. */ }
    resize();
  });
  $('model-version').addEventListener('change', () => switchVersion($('model-version').value));
  wirePicking({ canvas, camera: () => camera, meshes: () => state.meshes,
    enabled: () => state.ready && state.mode !== 'walk' && !document.querySelector('dialog[open]') && $('lighting-toggle').getAttribute('aria-expanded') !== 'true', onPick: inspectElement });
  $('inspector').addEventListener('close', () => {
    clearHighlight?.(); clearHighlight = null; selectedElement = null; buildingInstances?.select(null); invalidate();
  });
  $('element-search').addEventListener('input', renderElementSearch);
  $('clear-element-search').addEventListener('click', () => { $('element-search').value = ''; renderElementSearch(); $('element-search').focus(); });
  for (const button of document.querySelectorAll('[data-element-query]')) button.addEventListener('click', () => {
    $('element-search').value = button.dataset.elementQuery; renderElementSearch();
  });
  $('element-back').addEventListener('click', () => {
    const result = $('inspector').returnResult;
    $('inspector').close();
    openDialog($('explore'), $('explore-toggle'));
    if (result?.isConnected) result.focus({ preventScroll: true });
    else $('element-search').focus();
  });
  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('reset').addEventListener('click', resetView);
  $('zoom-in').addEventListener('click', () => navigate({ zoom: 0.8 }));
  $('zoom-out').addEventListener('click', () => navigate({ zoom: 1.25 }));
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
  $('fit-surroundings').addEventListener('click', () => frameView(true));
  $('floor').addEventListener('change', () => {
    state.level = $('floor').value;
    applyVisibility();
    const control = state.mode === 'plan' ? plan : orbit;
    settle(control);
    const elevation = activeLevels[state.level]?.elevation;
    if (elevation !== undefined) {
      const shift = elevation - control.target.y;
      control.target.y += shift; camera.position.y += shift; control.update();
    }
    updateModelSummary();
    $('announcer').textContent = `${$('floor').selectedOptions[0].textContent} · ${modeNames[state.mode]}`;
  });
  $('cut-height').addEventListener('input', () => {
    $('cut-value').textContent = `${Number($('cut-height').value).toFixed(1)} m`;
    setRangeDescription($('cut-height'), `${Number($('cut-height').value).toFixed(1)} meters above the selected floor`);
    applyVisibility();
  });
  $('brightness').addEventListener('input', applyLightingAppearance);
  $('daylight').addEventListener('change', updateDaylight);
  $('daylight-time').addEventListener('input', updateDaylight);
  $('daylight-date').addEventListener('change', updateDaylight);
  $('daylight-hour').addEventListener('change', () => {
    if (!$('daylight-hour').validity.valid) return;
    const [hour, minute] = $('daylight-hour').value.split(':').map(Number);
    $('daylight-time').value = hour * 60 + minute;
    updateDaylight();
  });
  $('daylight-day').addEventListener('input', () => {
    const selection = calendarSelection($('daylight-date').value);
    if (!selection) return;
    setDaylightDate(selection.year, Number($('daylight-day').value));
    updateDaylight();
  });
  $('daylight-now').addEventListener('click', () => {
    const now = localParts(new Date(), activeModel.location.timeZone);
    setDaylightDate(now.year, dayOfYear(now));
    $('daylight-time').value = now.hour * 60 + now.minute;
    updateDaylight();
  });
  $('shadows').addEventListener('change', applyLightingAppearance);
  $('reset-lighting').addEventListener('click', () => {
    $('daylight').checked = false;
    $('brightness').value = '1';
    $('shadows').checked = false;
    const today = localParts(new Date(), activeModel.location.timeZone);
    setDaylightDate(today.year, dayOfYear(today));
    $('daylight-time').value = '720';
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
    $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
    resize();
  });
  $('enter-walk').addEventListener('click', () => {
    if (!state.walker?.hasPosition) return;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    closeLighting();
    $('walk-message').textContent = '';
    if ($('walk-input').value === 'touch') { setWalkingActive(true, true); return; }
    // Call directly from the click event, never after an asynchronous operation.
    try { pointer.lock(); } catch { $('walk-message').textContent = 'Mouse capture failed. Click Enter again.'; }
  });
  $('walk-start').addEventListener('change', setWalkStart);
  $('fly').addEventListener('change', () => {
    if (!$('fly').checked && state.walker && !state.walker.hasSafePosition) setWalkStart();
    else state.walker?.setFlying($('fly').checked);
    $('fly-hint').hidden = !$('fly').checked;
    updateWalkPanel();
    invalidate();
  });
  window.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]')) return;
    if (state.touchWalking && event.key === 'Escape') { event.preventDefault(); pauseWalk(); return; }
    if (isWalking() && event.code === 'Tab') {
      if (pointer.isLocked) event.preventDefault();
      pauseWalk();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!pointer.isLocked && event.target !== canvas) return;
    if (event.code === 'KeyR' && !event.repeat) { event.preventDefault(); resetView(); }
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
      if (event.code === 'Enter' && state.mode === 'walk') $('enter-walk').click();
      if (event.key === '?' || event.code === 'KeyH') openDialog($('help'), canvas);
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
  window.addEventListener('blur', pauseWalk);
  window.addEventListener('pagehide', event => {
    syncViewURL();
    if (!event.persisted) {
      assetAbort.abort(); collisionAbort.abort(); frameLoop.stop();
      clearHighlight?.();
      buildingInstances?.dispose(); surroundings.instances?.dispose();
      surroundings.style?.setMuted(false); surroundings.style?.dispose();
      disposeAsset(model); disposeAsset(surroundings.root); disposeAsset(daylight?.sky);
      environmentTarget?.dispose(); sun.shadow.map?.dispose();
      orbit.dispose(); plan.dispose(); pointer.dispose(); renderer.dispose();
    }
  });
  document.addEventListener('visibilitychange', () => {
    keys.clear();
    state.previousTime = performance.now();
    if (document.hidden) pauseWalk();
    frameLoop.setPaused(document.hidden);
    invalidate();
  });
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  touchPrimary.addEventListener('change', resize);
  screen.orientation?.addEventListener('change', pauseWalk);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    frameLoop.stop();
    collisionAbort.abort();
    pauseWalk();
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
    state.dirty = false;
  }
  return isWalking() && Boolean(state.walker);
}

$('retry').addEventListener('click', () => location.reload());
wireDialogs();
wireLightingDropdown();
wireResponsiveLayout();
setRangeDescription($('brightness'), '100 percent');
setRangeDescription($('cut-height'), '2.0 meters above the selected floor');
try { initialize(); } catch (error) { showError(error); }
