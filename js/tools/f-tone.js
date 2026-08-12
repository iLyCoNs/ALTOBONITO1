/**
 * f-tone.js — Look / tonos live del panorama 360.
 * Incluye compresión global de altas luces y protector solar esférico.
 */
'use strict';

(function () {
  var STORAGE_KEY = 'ferrari360_tone';
  var _active = false;
  var _bound = false;
  var _markingSun = false;

  var DEFAULTS = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    warmth: 0,
    highlights: 0,
    sunStrength: 0,
    sunRadius: 24,
    sunPitch: null,
    sunYaw: null,
    vignette: 0
  };

  var PRESETS = {
    natural: Object.assign({}, DEFAULTS),
    vivo: Object.assign({}, DEFAULTS, { brightness: 1.04, contrast: 1.08, saturate: 1.28, warmth: -4, vignette: 0.12 }),
    calido: Object.assign({}, DEFAULTS, { brightness: 1.02, contrast: 1.05, saturate: 1.1, warmth: 18, vignette: 0.18 }),
    niebla: Object.assign({}, DEFAULTS, { brightness: 1.06, contrast: 0.92, saturate: 0.78, warmth: -6, vignette: 0.22 }),
    antisol: Object.assign({}, DEFAULTS, {
      brightness: 0.94,
      contrast: 0.92,
      saturate: 0.95,
      warmth: 3,
      highlights: 0.62,
      sunStrength: 0.36,
      sunRadius: 24,
      vignette: 0.04
    }),
    reset: Object.assign({}, DEFAULTS)
  };

  var _state = Object.assign({}, DEFAULTS);

  function _clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function _finiteOr(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function _hasSunPosition() {
    return _state.sunPitch !== null && _state.sunPitch !== '' &&
      _state.sunYaw !== null && _state.sunYaw !== '' &&
      Number.isFinite(Number(_state.sunPitch)) && Number.isFinite(Number(_state.sunYaw));
  }

  function getState() {
    return Object.assign({}, _state);
  }

  function _ensureVignetteEl() {
    var host = document.getElementById('pannellum-viewer');
    if (!host) return null;
    var el = document.getElementById('kpk-tone-vignette');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kpk-tone-vignette';
      el.className = 'kpk-tone-vignette';
      el.setAttribute('aria-hidden', 'true');
      host.appendChild(el);
    }
    return el;
  }

  function _ensureSunShieldEl() {
    var host = document.getElementById('pannellum-viewer');
    if (!host) return null;
    var el = document.getElementById('kpk-tone-sun-shield');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kpk-tone-sun-shield';
      el.className = 'kpk-tone-sun-shield';
      el.setAttribute('aria-hidden', 'true');
      host.appendChild(el);
    }
    return el;
  }

  function _ensureHighlightFilter() {
    var filter = document.getElementById('kpk-tone-highlights-filter');
    if (filter) return filter;
    var host = document.getElementById('pannellum-viewer');
    if (!host) return null;

    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';

    var defs = document.createElementNS(ns, 'defs');
    filter = document.createElementNS(ns, 'filter');
    filter.id = 'kpk-tone-highlights-filter';
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    var transfer = document.createElementNS(ns, 'feComponentTransfer');
    ['R', 'G', 'B'].forEach(function (channel) {
      var fn = document.createElementNS(ns, 'feFunc' + channel);
      fn.setAttribute('type', 'table');
      fn.setAttribute('tableValues', '0 0.2 0.4 0.6 0.8 1');
      transfer.appendChild(fn);
    });
    filter.appendChild(transfer);
    defs.appendChild(filter);
    svg.appendChild(defs);
    host.appendChild(svg);
    return filter;
  }

  function _updateHighlightCurve(amount) {
    var filter = _ensureHighlightFilter();
    if (!filter) return;
    var inputs = [0, 0.2, 0.4, 0.6, 0.8, 1];
    var values = inputs.map(function (x) {
      var highlight = Math.max(0, (x - 0.42) / 0.58);
      var y = x - amount * Math.pow(highlight, 1.35) * 0.28;
      return _clamp(y, 0, 1).toFixed(4);
    }).join(' ');
    filter.querySelectorAll('feFuncR, feFuncG, feFuncB').forEach(function (fn) {
      fn.setAttribute('tableValues', values);
    });
  }

  function apply(state) {
    if (state) _state = Object.assign({}, DEFAULTS, state);
    var b = _clamp(_finiteOr(_state.brightness, 1), 0.6, 1.5);
    var c = _clamp(_finiteOr(_state.contrast, 1), 0.6, 1.6);
    var s = _clamp(_finiteOr(_state.saturate, 1), 0.2, 2);
    var w = _clamp(_finiteOr(_state.warmth, 0), -30, 30);
    var h = _clamp(_finiteOr(_state.highlights, 0), 0, 0.8);
    var sun = _clamp(_finiteOr(_state.sunStrength, 0), 0, 0.7);
    var radius = _clamp(_finiteOr(_state.sunRadius, 24), 8, 45);
    var v = _clamp(_finiteOr(_state.vignette, 0), 0, 0.55);
    var sunPitch = _hasSunPosition() ? Number(_state.sunPitch) : null;
    var sunYaw = _hasSunPosition() ? Number(_state.sunYaw) : null;

    _state = {
      brightness: b,
      contrast: c,
      saturate: s,
      warmth: w,
      highlights: h,
      sunStrength: sun,
      sunRadius: radius,
      sunPitch: sunPitch,
      sunYaw: sunYaw,
      vignette: v
    };

    _updateHighlightCurve(h);
    var hue = w * 0.35;
    var sepia = Math.max(0, w) / 100;
    var highlightFilter = h > 0.005 ? 'url(#kpk-tone-highlights-filter) ' : '';
    var filter = highlightFilter +
      'brightness(' + b + ') contrast(' + c + ') saturate(' + s + ')' +
      ' hue-rotate(' + hue + 'deg) sepia(' + sepia.toFixed(3) + ')';

    var root = document.getElementById('pannellum-viewer');
    if (root) {
      root.style.setProperty('--kpk-tone-filter', filter);
      root.classList.toggle('kpk-tone-active', b !== 1 || c !== 1 || s !== 1 || w !== 0 || h > 0.005);
    }

    var vig = _ensureVignetteEl();
    if (vig) {
      vig.style.opacity = String(v);
      vig.style.display = v > 0.01 ? 'block' : 'none';
    }

    updateSunShield();
    _syncSliders();
    _syncSunControls();
  }

  function updateSunShield() {
    var el = _ensureSunShieldEl();
    if (!el) return;
    if (_state.sunStrength <= 0.005 || !_hasSunPosition() || !window.FerrariCamera) {
      el.style.display = 'none';
      return;
    }

    var proj = window.FerrariCamera.getProjectionParams();
    var cam = window.FerrariCamera.getCam(Number(_state.sunPitch), Number(_state.sunYaw));
    var point = window.FerrariCamera.camToPixel(cam, proj);
    if (!point.visible || cam.z <= 0.0001) {
      el.style.display = 'none';
      return;
    }

    var radiusPx = proj.f * Math.tan(_state.sunRadius * Math.PI / 180);
    radiusPx = _clamp(radiusPx, 36, Math.max(proj.w, proj.h) * 1.2);
    if (point.px < -radiusPx || point.py < -radiusPx || point.px > proj.w + radiusPx || point.py > proj.h + radiusPx) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'block';
    el.style.left = point.px.toFixed(1) + 'px';
    el.style.top = point.py.toFixed(1) + 'px';
    el.style.width = (radiusPx * 2).toFixed(1) + 'px';
    el.style.height = (radiusPx * 2).toFixed(1) + 'px';
    el.style.opacity = String(_state.sunStrength / 0.7);
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (e) {}
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function applySaved() {
    var saved = loadLocal();
    if (!saved) {
      try {
        var pack = JSON.parse(localStorage.getItem('ferrari360_datos') || '{}');
        if (pack && pack.tone) saved = pack.tone;
      } catch (e) {}
    }
    apply(saved || DEFAULTS);
  }

  function toJSON() {
    return getState();
  }

  function fromJSON(obj) {
    if (!obj || typeof obj !== 'object') return;
    apply(obj);
    saveLocal();
  }

  function applyPreset(id) {
    var preset = PRESETS[id] || PRESETS.natural;
    var next = Object.assign({}, preset);
    if (id === 'antisol' && _hasSunPosition()) {
      next.sunPitch = _state.sunPitch;
      next.sunYaw = _state.sunYaw;
    }
    apply(next);
    saveLocal();
    if (id === 'antisol' && !_hasSunPosition()) {
      window.FerrariUI && window.FerrariUI.showToast('Anti-sol aplicado. Ahora pulsa “Marcar el sol” y toca su centro.', 'info');
    }
  }

  function _readSlidersIntoState() {
    var map = {
      brightness: 'tone-brightness',
      contrast: 'tone-contrast',
      saturate: 'tone-saturate',
      warmth: 'tone-warmth',
      highlights: 'tone-highlights',
      sunStrength: 'tone-sun-strength',
      sunRadius: 'tone-sun-radius',
      vignette: 'tone-vignette'
    };
    Object.keys(map).forEach(function (key) {
      var el = document.getElementById(map[key]);
      if (!el) return;
      var raw = parseFloat(el.value);
      if (key === 'warmth' || key === 'sunRadius') _state[key] = raw;
      else _state[key] = raw / 100;
    });
  }

  function _syncSliders() {
    var pairs = [
      ['tone-brightness', _state.brightness * 100, 'tone-brightness-val', Math.round(_state.brightness * 100) + '%'],
      ['tone-contrast', _state.contrast * 100, 'tone-contrast-val', Math.round(_state.contrast * 100) + '%'],
      ['tone-saturate', _state.saturate * 100, 'tone-saturate-val', Math.round(_state.saturate * 100) + '%'],
      ['tone-warmth', _state.warmth, 'tone-warmth-val', (_state.warmth > 0 ? '+' : '') + Math.round(_state.warmth)],
      ['tone-highlights', _state.highlights * 100, 'tone-highlights-val', Math.round(_state.highlights * 100) + '%'],
      ['tone-sun-strength', _state.sunStrength * 100, 'tone-sun-strength-val', Math.round(_state.sunStrength * 100) + '%'],
      ['tone-sun-radius', _state.sunRadius, 'tone-sun-radius-val', Math.round(_state.sunRadius) + '°'],
      ['tone-vignette', _state.vignette * 100, 'tone-vignette-val', Math.round(_state.vignette * 100) + '%']
    ];
    pairs.forEach(function (row) {
      var el = document.getElementById(row[0]);
      var label = document.getElementById(row[2]);
      if (el && document.activeElement !== el) el.value = String(row[1]);
      if (label) label.textContent = row[3];
    });
  }

  function _syncSunControls() {
    var btn = document.getElementById('tone-mark-sun-btn');
    var status = document.getElementById('tone-sun-status');
    var hasSun = _hasSunPosition();
    if (btn) {
      btn.classList.toggle('is-marking', _markingSun);
      btn.textContent = _markingSun
        ? 'Haz clic en el centro del sol…'
        : (hasSun ? 'Cambiar posición del sol' : 'Marcar el sol en el 360');
    }
    if (status) {
      status.classList.toggle('is-set', hasSun);
      status.textContent = hasSun
        ? 'Sol fijado: el protector permanecerá alineado al recorrer el 360.'
        : 'Primero aplica Anti-sol y luego marca el centro del sol.';
    }
  }

  function _showPanel(show) {
    var panel = document.getElementById('tone-look-panel');
    if (panel) panel.style.display = show ? 'block' : 'none';
  }

  function _setSunMarking(marking) {
    _markingSun = !!marking;
    var root = document.getElementById('pannellum-viewer');
    if (root) root.classList.toggle('tone-sun-marking', _markingSun);
    try {
      var viewer = window.Ferrari && window.Ferrari.viewer;
      if (viewer && typeof viewer.setDraggable === 'function') viewer.setDraggable(!_markingSun);
    } catch (e) {}
    _syncSunControls();
  }

  function _onPanoramaClick(e) {
    if (!_active || !_markingSun) return;
    var viewer = window.Ferrari && window.Ferrari.viewer;
    if (!viewer) return;
    var coords;
    try { coords = viewer.mouseEventToCoords(e); } catch (err) { return; }
    if (!coords || coords.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    _state.sunPitch = Number(coords[0]);
    _state.sunYaw = Number(coords[1]);
    if (_state.sunStrength < 0.05) _state.sunStrength = 0.36;
    _setSunMarking(false);
    apply(_state);
    saveLocal();
    window.FerrariUI && window.FerrariUI.showToast('Sol fijado. El protector seguirá su posición al girar el 360.', 'success');
  }

  function activate() {
    window.FerrariTools.deactivateAllTools();
    _active = true;
    window.currentTool = 'tone';
    _showPanel(true);
    apply(_state);
    window.FerrariHUD && window.FerrariHUD.showDraw('tone');
    window.FerrariUI && window.FerrariUI.showToast('Tonos 360: equilibra el color o aplica Anti-sol natural.', 'info');
  }

  function deactivate() {
    if (!_active) return;
    _active = false;
    _setSunMarking(false);
    _showPanel(false);
    window.FerrariHUD && window.FerrariHUD.hideDraw();
  }

  function isActive() { return _active; }

  function bindEvents() {
    if (_bound) return;
    _bound = true;

    [
      'tone-brightness', 'tone-contrast', 'tone-saturate', 'tone-warmth',
      'tone-highlights', 'tone-sun-strength', 'tone-sun-radius', 'tone-vignette'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        _readSlidersIntoState();
        apply(_state);
        saveLocal();
      });
    });

    document.querySelectorAll('[data-tone-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyPreset(btn.getAttribute('data-tone-preset'));
      });
    });

    var markBtn = document.getElementById('tone-mark-sun-btn');
    if (markBtn) {
      markBtn.addEventListener('click', function () {
        _setSunMarking(!_markingSun);
        if (_markingSun) {
          window.FerrariUI && window.FerrariUI.showToast('Haz clic exactamente en el centro del sol.', 'info');
        }
      });
    }

    var panorama = document.getElementById('pannellum-viewer');
    if (panorama) panorama.addEventListener('click', _onPanoramaClick, false);

    var resetBtn = document.getElementById('tone-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        _setSunMarking(false);
        applyPreset('reset');
      });
    }
  }

  function _boot() {
    applySaved();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

  window.FerrariTone = {
    STORAGE_KEY: STORAGE_KEY,
    PRESETS: PRESETS,
    activate: activate,
    deactivate: deactivate,
    isActive: isActive,
    bindEvents: bindEvents,
    apply: apply,
    applySaved: applySaved,
    applyPreset: applyPreset,
    updateSunShield: updateSunShield,
    getState: getState,
    toJSON: toJSON,
    fromJSON: fromJSON,
    saveLocal: saveLocal
  };
})();
