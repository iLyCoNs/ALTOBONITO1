/**
 * f-draw-retorno.js — Cabeza de retorno / cul-de-sac fusionada a la red vial.
 *
 * Un clic sobre el eje de una calle crea un disco métrico de asfalto que se
 * renderiza dentro del mismo path unificado. No admite colocación flotante.
 */
'use strict';

(function () {
  const ALTITUDE_M = 120;
  const SEGMENTS = 32;
  const SNAP_PX = 38;

  let _active = false;
  let _bound = false;
  let _diameterM = 24;
  let _snap = null;
  let _preview = null;

  function activate() {
    window.FerrariTools.deactivateAllTools();
    _active = true;
    window.currentTool = 'calle-retorno';
    const host = document.getElementById('panorama-container');
    if (host) host.classList.add('drawing-active', 'calle-retorno-active');
    const panel = document.getElementById('retorno-size-panel');
    if (panel) panel.style.display = '';
    _setDraggable(false);
    window.FerrariHUD && window.FerrariHUD.showDraw('calle-retorno');
    window.FerrariUI && window.FerrariUI.showToast(
      'Retorno: ajusta el diámetro, apunta al eje de una calle y haz clic para fusionarlo.',
      'info'
    );
  }

  function deactivate() {
    if (!_active) return;
    _active = false;
    _snap = null;
    const host = document.getElementById('panorama-container');
    if (host) host.classList.remove('drawing-active', 'calle-retorno-active');
    const panel = document.getElementById('retorno-size-panel');
    if (panel) panel.style.display = 'none';
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
    container.addEventListener('mousemove', _onMove, false);
    container.addEventListener('click', _onClick, false);
    document.addEventListener('keydown', _onKeyDown, false);

    const slider = document.getElementById('retorno-size-slider');
    const value = document.getElementById('retorno-size-value');
    if (slider) {
      _diameterM = parseInt(slider.value, 10) || 24;
      slider.addEventListener('input', function () {
        _diameterM = Math.max(12, Math.min(44, parseInt(slider.value, 10) || 24));
        if (value) value.textContent = _diameterM + ' m';
        const pct = ((_diameterM - 12) / 32) * 100;
        slider.style.setProperty('--val', pct + '%');
        _updatePreview();
      });
    }
  }

  function _onMove(e) {
    if (!_active) return;
    const coords = _getCoords(e);
    if (!coords || !window.FerrariStreetNetwork) return;
    _snap = window.FerrariStreetNetwork.findStreetSnap(coords[0], coords[1], SNAP_PX);
    _updatePreview();
  }

  function _onClick(e) {
    if (!_active || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const coords = _getCoords(e);
    if (coords && window.FerrariStreetNetwork) {
      _snap = window.FerrariStreetNetwork.findStreetSnap(coords[0], coords[1], SNAP_PX);
    }
    if (!_snap || !_snap.lineId) {
      window.FerrariUI && window.FerrariUI.showToast(
        'Acerca el cursor al eje o al extremo de una calle para conectar el retorno.',
        'info'
      );
      return;
    }

    const street = window.FerrariState.getLine(_snap.lineId);
    if (!street) return;
    if (!street.redId && window.FerrariStreetNetwork.integrateStreet) {
      window.FerrariStreetNetwork.integrateStreet(street.id);
    }

    const points = _buildCircle(_snap.pitch, _snap.yaw, _diameterM);
    if (points.length < 3) return;

    const id = window.FerrariState.addLine({
      tipo: 'calle-retorno',
      puntos: points,
      centro: [_snap.pitch, _snap.yaw],
      diametroM: _diameterM,
      altitudM: ALTITUDE_M,
      redId: street.redId || null,
      conectadoA: street.id,
      createdAt: Date.now()
    });

    if (window.FerrariCamera) window.FerrariCamera.markDirty();
    if (window.FerrariRAF && window.FerrariRAF.markDataDirty) {
      window.FerrariRAF.markDataDirty();
    }
    window.FerrariUI && window.FerrariUI.showToast(
      'Cabeza de retorno de ' + _diameterM + ' m fusionada con la calle.',
      'success'
    );
    console.log('[Ferrari/Retorno] Creado:', id, 'calle:', street.id, 'diámetro:', _diameterM);
  }

  function _onKeyDown(e) {
    if (!_active || e.key !== 'Escape') return;
    e.preventDefault();
    window.FerrariTools.deactivateAllTools();
  }

  function _buildCircle(pitch, yaw, diameterM) {
    const math = window.FerrariMathScale;
    if (!math) return [];
    const center = math.pitchYawToGround(pitch, yaw, ALTITUDE_M);
    const radius = diameterM / 2;
    const points = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2;
      const s = math.groundToPitchYaw(
        center.x + Math.cos(angle) * radius,
        center.z + Math.sin(angle) * radius,
        ALTITUDE_M
      );
      points.push([s.pitch, s.yaw]);
    }
    return points;
  }

  function _ensurePreview() {
    if (_preview) return _preview;
    const overlay = document.getElementById('kpk-draw-overlay');
    if (!overlay) return null;
    _preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    _preview.setAttribute('class', 'calle-retorno-preview');
    overlay.appendChild(_preview);
    return _preview;
  }

  function _updatePreview() {
    if (!_active || !_snap) {
      _removePreview();
      return;
    }
    const el = _ensurePreview();
    if (!el) return;
    const points = _buildCircle(_snap.pitch, _snap.yaw, _diameterM);
    const proj = window.FerrariCamera.getProjectionParams();
    let d = '';
    let count = 0;
    for (let i = 0; i < points.length; i++) {
      const p = window.FerrariCamera.sphereToPixel(points[i][0], points[i][1], proj);
      if (!p.visible) continue;
      d += (count++ ? ' L ' : 'M ') + p.px.toFixed(1) + ' ' + p.py.toFixed(1);
    }
    el.setAttribute('d', count >= 3 ? d + ' Z' : 'M -9999 -9999');
  }

  function _removePreview() {
    if (_preview && _preview.parentNode) _preview.remove();
    _preview = null;
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

  window.FerrariDrawRetorno = { activate, deactivate, isActive, bindEvents };
  console.log('[Ferrari/Retorno] ✓ Módulo inicializado');
})();
