/**
 * f-idle-cam.js — Autorotate cinematográfico idle (estilo HAM / krpano)
 * Slow yaw + pitch hacia el terreno; pausa en drag; resume tras inactivity.
 */
'use strict';

(function () {
  var SPEED = -0.7;       // x2 respecto al idle cinematográfico base (−0.35)
  var DELAY_MS = 6000;
  var FALLBACK_PITCH = -80;

  var _armed = false;
  var _paused = false;
  var _started = false;
  var _terrainPitch = FALLBACK_PITCH;
  var _pendingTimer = null;
  // En Arquitecto la cámara debe permanecer estable para dibujar con precisión.
  // El usuario puede habilitar el recorrido manualmente desde el panel.
  var _editorMotionEnabled = window.FERRARI_MODE !== 'editor';

  function _motionAllowed() {
    return window.FERRARI_MODE !== 'editor' || _editorMotionEnabled;
  }

  function _viewer() {
    return window.Ferrari && window.Ferrari.viewer;
  }

  function _restoreDelay(viewer) {
    try {
      var cfg = viewer.getConfig && viewer.getConfig();
      if (cfg) cfg.autoRotateInactivityDelay = _motionAllowed() ? DELAY_MS : -1;
    } catch (e) {}
  }

  function setTerrainPitch(pitch) {
    // Idle fijo hacia el nadir / terreno (pedido: P −80°)
    if (typeof pitch === 'number' && isFinite(pitch)) {
      _terrainPitch = Math.max(-90, Math.min(0, pitch));
    }
  }

  function inferTerrainPitch() {
    _terrainPitch = FALLBACK_PITCH;
    return _terrainPitch;
  }

  /** Config inicial del viewer (llamar desde _createViewer). */
  function applyViewerConfig(config) {
    if (!config) return config;
    config.autoRotateInactivityDelay = _motionAllowed() ? DELAY_MS : -1;
    return config;
  }

  function start(opts) {
    opts = opts || {};
    var viewer = _viewer();
    if (!viewer || !viewer.startAutoRotate) return;
    if (!_motionAllowed()) {
      pause();
      return;
    }
    if (_paused && !opts.force) return;

    if (opts.pitch != null) setTerrainPitch(opts.pitch);
    else inferTerrainPitch();

    _restoreDelay(viewer);
    try {
      // Pitch objetivo del idle (Pannellum guarda Ga al reanudar tras inactividad)
      viewer.startAutoRotate(SPEED, _terrainPitch);
      if (typeof viewer.lookAt === 'function') {
        viewer.lookAt(_terrainPitch, undefined, undefined, 2800);
      }
      _started = true;
      _armed = true;
    } catch (e) {
      console.warn('[Ferrari/IdleCam] start failed', e);
    }
  }

  /**
   * Arranca idle tras intro cinematográfico, o diferido si el intro ya jugó.
   */
  function scheduleStart(delayMs) {
    if (_pendingTimer) {
      clearTimeout(_pendingTimer);
      _pendingTimer = null;
    }
    if (!_motionAllowed()) return;
    var ms = delayMs == null ? 400 : delayMs;
    _pendingTimer = setTimeout(function () {
      _pendingTimer = null;
      if (_paused || !_motionAllowed()) return;
      start({ force: false });
    }, ms);
  }

  function pause() {
    _paused = true;
    if (_pendingTimer) {
      clearTimeout(_pendingTimer);
      _pendingTimer = null;
    }
    var viewer = _viewer();
    if (!viewer) return;
    try {
      if (viewer.stopAutoRotate) viewer.stopAutoRotate();
      // stopAutoRotate mata el delay (−1); lo restauramos para resume futuro
      _restoreDelay(viewer);
      if (viewer.stopMovement) viewer.stopMovement();
    } catch (e) {}
  }

  function resume() {
    if (!_motionAllowed()) {
      pause();
      return;
    }
    if (!_paused && _started) return;
    _paused = false;
    if (!_armed && !_started) {
      scheduleStart(800);
      return;
    }
    start({ force: true });
  }

  function setEditorMotionEnabled(enabled) {
    _editorMotionEnabled = !!enabled;
    if (window.FERRARI_MODE !== 'editor') return;
    if (!_editorMotionEnabled) {
      pause();
    } else {
      _paused = false;
      scheduleStart(120);
    }
  }

  function isEditorMotionEnabled() {
    return window.FERRARI_MODE !== 'editor' || _editorMotionEnabled;
  }

  function isPaused() { return !!_paused; }
  function isStarted() { return !!_started; }

  window.FerrariIdleCam = {
    SPEED: SPEED,
    DELAY_MS: DELAY_MS,
    applyViewerConfig: applyViewerConfig,
    setTerrainPitch: setTerrainPitch,
    inferTerrainPitch: inferTerrainPitch,
    start: start,
    scheduleStart: scheduleStart,
    pause: pause,
    resume: resume,
    setEditorMotionEnabled: setEditorMotionEnabled,
    isEditorMotionEnabled: isEditorMotionEnabled,
    isPaused: isPaused,
    isStarted: isStarted
  };
})();
