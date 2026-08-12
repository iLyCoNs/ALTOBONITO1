/**
 * f-tone.js — Corrección tonal uniforme del panorama 360.
 * Usa una curva global para comprimir altas luces y recuperar sombras.
 */
'use strict';

(function () {
  var STORAGE_KEY = 'ferrari360_tone';
  var _active = false;
  var _bound = false;

  var DEFAULTS = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    warmth: 0,
    highlights: 0,
    shadows: 0,
    vignette: 0
  };

  var PRESETS = {
    natural: Object.assign({}, DEFAULTS),
    vivo: Object.assign({}, DEFAULTS, { brightness: 1.04, contrast: 1.08, saturate: 1.28, warmth: -4, vignette: 0.12 }),
    calido: Object.assign({}, DEFAULTS, { brightness: 1.02, contrast: 1.05, saturate: 1.1, warmth: 18, vignette: 0.18 }),
    niebla: Object.assign({}, DEFAULTS, { brightness: 1.06, contrast: 0.92, saturate: 0.78, warmth: -6, vignette: 0.22 }),
    antisol: Object.assign({}, DEFAULTS, {
      brightness: 0.98,
      contrast: 0.98,
      saturate: 0.96,
      warmth: 2,
      highlights: 0.56,
      shadows: 0.26,
      vignette: 0.02
    }),
    reset: Object.assign({}, DEFAULTS)
  };

  var _state = Object.assign({}, DEFAULTS);

  function _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function _finiteOr(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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

  function _ensureToneCurveFilter() {
    var filter = document.getElementById('kpk-tone-curve-filter');
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
    filter.id = 'kpk-tone-curve-filter';
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

  function _updateToneCurve(highlights, shadows) {
    var filter = _ensureToneCurveFilter();
    if (!filter) return;
    var inputs = [0, 0.2, 0.4, 0.6, 0.8, 1];
    var values = inputs.map(function (x) {
      var highlightWeight = Math.max(0, (x - 0.42) / 0.58);
      var highlightReduction = highlights * Math.pow(highlightWeight, 1.35) * 0.28;
      var shadowWeight = x < 0.62 ? Math.sin(Math.PI * x / 0.62) : 0;
      var shadowLift = shadows * Math.max(0, shadowWeight) * 0.16;
      return _clamp(x + shadowLift - highlightReduction, 0, 1).toFixed(4);
    }).join(' ');
    filter.querySelectorAll('feFuncR, feFuncG, feFuncB').forEach(function (fn) {
      fn.setAttribute('tableValues', values);
    });
  }

  function apply(state) {
    if (state) _state = Object.assign({}, DEFAULTS, state);
    var brightness = _clamp(_finiteOr(_state.brightness, 1), 0.6, 1.5);
    var contrast = _clamp(_finiteOr(_state.contrast, 1), 0.6, 1.6);
    var saturate = _clamp(_finiteOr(_state.saturate, 1), 0.2, 2);
    var warmth = _clamp(_finiteOr(_state.warmth, 0), -30, 30);
    var highlights = _clamp(_finiteOr(_state.highlights, 0), 0, 0.8);
    var shadows = _clamp(_finiteOr(_state.shadows, 0), 0, 0.6);
    var vignette = _clamp(_finiteOr(_state.vignette, 0), 0, 0.55);

    _state = {
      brightness: brightness,
      contrast: contrast,
      saturate: saturate,
      warmth: warmth,
      highlights: highlights,
      shadows: shadows,
      vignette: vignette
    };

    _updateToneCurve(highlights, shadows);
    var hue = warmth * 0.35;
    var sepia = Math.max(0, warmth) / 100;
    var useCurve = highlights > 0.005 || shadows > 0.005;
    var filter = (useCurve ? 'url(#kpk-tone-curve-filter) ' : '') +
      'brightness(' + brightness + ') contrast(' + contrast + ') saturate(' + saturate + ')' +
      ' hue-rotate(' + hue + 'deg) sepia(' + sepia.toFixed(3) + ')';

    var root = document.getElementById('pannellum-viewer');
    if (root) {
      root.style.setProperty('--kpk-tone-filter', filter);
      root.classList.toggle('kpk-tone-active',
        brightness !== 1 || contrast !== 1 || saturate !== 1 || warmth !== 0 || useCurve);
    }

    var vignetteEl = _ensureVignetteEl();
    if (vignetteEl) {
      vignetteEl.style.opacity = String(vignette);
      vignetteEl.style.display = vignette > 0.01 ? 'block' : 'none';
    }

    _syncSliders();
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (e) {}
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
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
    apply(PRESETS[id] || PRESETS.natural);
    saveLocal();
    if (id === 'antisol') {
      window.FerrariUI && window.FerrariUI.showToast(
        'Anti-sol uniforme aplicado: luces contenidas y terreno recuperado, sin halos.',
        'success'
      );
    }
  }

  function _readSlidersIntoState() {
    var map = {
      brightness: 'tone-brightness',
      contrast: 'tone-contrast',
      saturate: 'tone-saturate',
      warmth: 'tone-warmth',
      highlights: 'tone-highlights',
      shadows: 'tone-shadows',
      vignette: 'tone-vignette'
    };
    Object.keys(map).forEach(function (key) {
      var el = document.getElementById(map[key]);
      if (!el) return;
      var raw = parseFloat(el.value);
      _state[key] = key === 'warmth' ? raw : raw / 100;
    });
  }

  function _syncSliders() {
    var pairs = [
      ['tone-brightness', _state.brightness * 100, 'tone-brightness-val', Math.round(_state.brightness * 100) + '%'],
      ['tone-contrast', _state.contrast * 100, 'tone-contrast-val', Math.round(_state.contrast * 100) + '%'],
      ['tone-saturate', _state.saturate * 100, 'tone-saturate-val', Math.round(_state.saturate * 100) + '%'],
      ['tone-warmth', _state.warmth, 'tone-warmth-val', (_state.warmth > 0 ? '+' : '') + Math.round(_state.warmth)],
      ['tone-highlights', _state.highlights * 100, 'tone-highlights-val', Math.round(_state.highlights * 100) + '%'],
      ['tone-shadows', _state.shadows * 100, 'tone-shadows-val', Math.round(_state.shadows * 100) + '%'],
      ['tone-vignette', _state.vignette * 100, 'tone-vignette-val', Math.round(_state.vignette * 100) + '%']
    ];
    pairs.forEach(function (row) {
      var el = document.getElementById(row[0]);
      var label = document.getElementById(row[2]);
      if (el && document.activeElement !== el) el.value = String(row[1]);
      if (label) label.textContent = row[3];
    });
  }

  function _showPanel(show) {
    var panel = document.getElementById('tone-look-panel');
    if (panel) panel.style.display = show ? 'block' : 'none';
  }

  function activate() {
    window.FerrariTools.deactivateAllTools();
    _active = true;
    window.currentTool = 'tone';
    _showPanel(true);
    apply(_state);
    window.FerrariHUD && window.FerrariHUD.showDraw('tone');
    window.FerrariUI && window.FerrariUI.showToast('Tonos 360: corrección uniforme, sin máscaras visibles.', 'info');
  }

  function deactivate() {
    if (!_active) return;
    _active = false;
    _showPanel(false);
    window.FerrariHUD && window.FerrariHUD.hideDraw();
  }

  function isActive() { return _active; }

  function bindEvents() {
    if (_bound) return;
    _bound = true;

    [
      'tone-brightness', 'tone-contrast', 'tone-saturate', 'tone-warmth',
      'tone-highlights', 'tone-shadows', 'tone-vignette'
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

    var resetBtn = document.getElementById('tone-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
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
    getState: getState,
    toJSON: toJSON,
    fromJSON: fromJSON,
    saveLocal: saveLocal
  };
})();
