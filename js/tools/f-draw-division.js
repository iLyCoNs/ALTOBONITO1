/**
 * f-draw-division.js — Divisiones territoriales curvas y punteadas.
 * Los puntos de control se suavizan en el plano métrico del terreno.
 */
'use strict';

(function () {
  const ALTITUDE_M = 120;
  const SUBDIVISIONS = 10;

  let _active = false;
  let _bound = false;
  let _widthPx = 3;
  let _dashPx = 14;
  let _closed = false;
  let _preview = null;

  function activate() {
    window.FerrariTools.deactivateAllTools();
    _active = true;
    window.currentTool = 'division-curva';
    document.getElementById('panorama-container').classList.add('drawing-active', 'division-curva-active');
    const panel = document.getElementById('division-curva-panel');
    if (panel) panel.style.display = '';
    window.FerrariOverlay.startDrawing([]);
    _setDraggable(false);
    window.FerrariHUD && window.FerrariHUD.showDraw('division-curva');
    window.FerrariUI && window.FerrariUI.showToast(
      'División Curva: marca puntos sobre el terreno y pulsa Enter para terminar.',
      'info'
    );
  }

  function deactivate() {
    if (!_active) return;
    _active = false;
    const host = document.getElementById('panorama-container');
    if (host) host.classList.remove('drawing-active', 'division-curva-active');
    const panel = document.getElementById('division-curva-panel');
    if (panel) panel.style.display = 'none';
    window.FerrariOverlay.clearOverlay();
    _removePreview();
    _setDraggable(true);
    window.FerrariHUD && window.FerrariHUD.hideDraw();
  }

  function isActive() { return _active; }

  function bindEvents() {
    if (_bound) return;
    _bound = true;
    const container = document.getElementById('pannellum-viewer');
    if (!container) return;
    container.addEventListener('click', _onClick, false);
    container.addEventListener('dblclick', _onDoubleClick, false);
    container.addEventListener('mousemove', _onMove, false);
    document.addEventListener('keydown', _onKeyDown, false);

    _bindSlider('division-width-slider', 'division-width-value', function (value) {
      _widthPx = Math.max(1, Math.min(8, value));
      return _format(_widthPx) + ' px';
    });
    _bindSlider('division-dash-slider', 'division-dash-value', function (value) {
      _dashPx = Math.max(5, Math.min(30, value));
      return Math.round(_dashPx) + ' px';
    });

    const closeToggle = document.getElementById('division-close-toggle');
    if (closeToggle) {
      _closed = !!closeToggle.checked;
      closeToggle.addEventListener('change', function () {
        _closed = !!closeToggle.checked;
        _updatePreview();
      });
    }
  }

  function finish() {
    if (!_active) return;
    const controls = window.FerrariOverlay.getActivePoints();
    const minPoints = _closed ? 3 : 2;
    if (controls.length < minPoints) {
      window.FerrariUI && window.FerrariUI.showToast(
        _closed ? 'El perímetro cerrado necesita al menos 3 puntos.' : 'La división necesita al menos 2 puntos.',
        'info'
      );
      return;
    }

    const smooth = _smoothOnGround(controls, _closed);
    if (smooth.length < minPoints) return;
    window.FerrariState.addLine({
      tipo: 'division-curva',
      puntos: smooth,
      cerrada: _closed,
      grosorPx: _widthPx,
      dashPx: _dashPx,
      altitudM: ALTITUDE_M,
      createdAt: Date.now()
    });
    window.FerrariOverlay.startDrawing([]);
    _removePreview();
    if (window.FerrariCamera) window.FerrariCamera.markDirty();
    if (window.FerrariRAF && window.FerrariRAF.markDataDirty) window.FerrariRAF.markDataDirty();
    window.FerrariHUD && window.FerrariHUD.updateDraw('division-curva', 0);
    window.FerrariUI && window.FerrariUI.showToast(
      _closed ? 'Perímetro curvo punteado guardado.' : 'División curva punteada guardada.',
      'success'
    );
  }

  function _onClick(e) {
    if (!_active || e.button !== 0) return;
    const coords = _getCoords(e);
    if (!coords) return;
    e.preventDefault();
    e.stopPropagation();
    window.FerrariOverlay.addPoint(coords[0], coords[1]);
    _updatePreview(coords);
    _updateHUD();
  }

  function _onDoubleClick(e) {
    if (!_active) return;
    e.preventDefault();
    e.stopPropagation();
    // El segundo click del doble clic ya fue agregado: retirarlo antes de cerrar.
    window.FerrariOverlay.removeLastPoint();
    finish();
  }

  function _onMove(e) {
    if (!_active) return;
    const coords = _getCoords(e);
    if (!coords) return;
    window.FerrariOverlay.setCursor(coords[0], coords[1]);
    _updatePreview(coords);
  }

  function _onKeyDown(e) {
    if (!_active) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      finish();
    } else if (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z'))) {
      e.preventDefault();
      window.FerrariOverlay.removeLastPoint();
      _updatePreview();
      _updateHUD();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      window.FerrariOverlay.startDrawing([]);
      _removePreview();
      _updateHUD();
    }
  }

  function _smoothOnGround(points, closed) {
    const math = window.FerrariMathScale;
    if (!math || !points.length) return [];
    const ground = points.map(function (point) {
      return math.pitchYawToGround(point[0], point[1], ALTITUDE_M);
    });
    const count = ground.length;
    const output = [];
    const segmentCount = closed ? count : count - 1;

    for (let i = 0; i < segmentCount; i++) {
      const p0 = ground[closed ? (i - 1 + count) % count : Math.max(0, i - 1)];
      const p1 = ground[i];
      const p2 = ground[(i + 1) % count];
      const p3 = ground[closed ? (i + 2) % count : Math.min(count - 1, i + 2)];
      for (let step = 0; step < SUBDIVISIONS; step++) {
        const t = step / SUBDIVISIONS;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        const z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t +
          (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
          (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
        const sphere = math.groundToPitchYaw(x, z, ALTITUDE_M);
        output.push([sphere.pitch, sphere.yaw]);
      }
    }
    if (!closed) output.push(points[points.length - 1].slice());
    return output;
  }

  function _ensurePreview() {
    if (_preview) return _preview;
    const layer = document.getElementById('kpk-draw-overlay');
    if (!layer) return null;
    _preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    _preview.setAttribute('class', 'division-curva-preview');
    layer.insertBefore(_preview, layer.firstChild);
    return _preview;
  }

  function _updatePreview(cursor) {
    if (!_active) return;
    let controls = window.FerrariOverlay.getActivePoints();
    if (cursor && controls.length) controls = controls.concat([[cursor[0], cursor[1]]]);
    if (controls.length < 2) {
      _removePreview();
      return;
    }
    const previewClosed = _closed && controls.length >= 3 && !cursor;
    const points = _smoothOnGround(controls, previewClosed);
    const el = _ensurePreview();
    if (!el) return;
    const proj = window.FerrariCamera.getProjectionParams();
    let d = '';
    let hasVisible = false;
    points.forEach(function (point) {
      const pixel = window.FerrariCamera.sphereToPixel(point[0], point[1], proj);
      if (!pixel.visible) { hasVisible = false; return; }
      d += (hasVisible ? 'L ' : 'M ') + pixel.px.toFixed(1) + ' ' + pixel.py.toFixed(1) + ' ';
      hasVisible = true;
    });
    if (previewClosed && d) d += 'Z';
    el.setAttribute('d', d || 'M -9999 -9999');
    el.style.strokeWidth = _widthPx + 'px';
    el.setAttribute('stroke-dasharray', _dashPx + ' ' + Math.max(4, _dashPx * 0.72));
  }

  function _removePreview() {
    if (_preview && _preview.parentNode) _preview.remove();
    _preview = null;
  }

  function _bindSlider(sliderId, valueId, applyValue) {
    const slider = document.getElementById(sliderId);
    const value = document.getElementById(valueId);
    if (!slider) return;
    const update = function () {
      const result = applyValue(parseFloat(slider.value));
      if (value) value.textContent = result;
      _updatePreview();
    };
    update();
    slider.addEventListener('input', update);
  }

  function _getCoords(e) {
    const viewer = window.Ferrari && window.Ferrari.viewer;
    if (!viewer) return null;
    try { return viewer.mouseEventToCoords(e); } catch (err) { return null; }
  }

  function _setDraggable(enabled) {
    try {
      const viewer = window.Ferrari && window.Ferrari.viewer;
      if (viewer && typeof viewer.setDraggable === 'function') viewer.setDraggable(!!enabled);
    } catch (e) {}
  }

  function _format(value) {
    return (Math.round(value * 10) / 10).toLocaleString('es-CL', { maximumFractionDigits: 1 });
  }

  function _updateHUD() {
    const count = window.FerrariOverlay.getActivePoints().length;
    window.FerrariHUD && window.FerrariHUD.updateDraw('division-curva', count);
  }

  window.FerrariDrawDivision = { activate, deactivate, isActive, bindEvents, finish };
  console.log('[Ferrari/DivisiónCurva] ✓ Módulo inicializado');
})();
