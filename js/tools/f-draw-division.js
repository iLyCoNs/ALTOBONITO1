/**
 * f-draw-division.js — Divisiones territoriales curvas y punteadas.
 * Los puntos de control se suavizan en el plano métrico del terreno.
 */
'use strict';

(function () {
  const ALTITUDE_M = 120;
  const SUBDIVISIONS = 10;
  const EDGE_SNAP_M = 9;

  let _active = false;
  let _bound = false;
  let _widthPx = 3;
  let _dashPx = 14;
  let _gapPx = 22;
  let _closed = false;
  let _preview = null;

  function activate() {
    window.FerrariTools.deactivateAllTools();
    const repaired = _repairStandaloneMedianeras();
    _active = true;
    window.currentTool = 'division-curva';
    document.getElementById('panorama-container').classList.add('drawing-active', 'division-curva-active');
    const panel = document.getElementById('division-curva-panel');
    if (panel) panel.style.display = '';
    window.FerrariOverlay.startDrawing([]);
    _setDraggable(false);
    window.FerrariHUD && window.FerrariHUD.showDraw('division-curva');
    window.FerrariUI && window.FerrariUI.showToast(
      repaired
        ? 'Medianera anterior reparada · ya puedes continuar dibujando.'
        : 'División Curva: marca puntos sobre el terreno y pulsa Enter para terminar.',
      repaired ? 'success' : 'info'
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
    _bindSlider('division-gap-slider', 'division-gap-value', function (value) {
      _gapPx = Math.max(8, Math.min(45, value));
      return Math.round(_gapPx) + ' px';
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

    let smooth = _smoothOnGround(controls, _closed);
    if (smooth.length < minPoints) return;

    if (!_closed) {
      const reshaped = _reshapeExistingMedianera(smooth);
      if (reshaped) {
        const replacements = new Map(reshaped.lotes.map(function (line) { return [line.id, line]; }));
        const nextLines = (window.allDrawnLines || []).map(function (line) {
          return replacements.get(line.id) || line;
        });
        window.FerrariState.replaceAll(nextLines);
        window.FerrariOverlay.startDrawing([]);
        _removePreview();
        if (window.FerrariCamera) window.FerrariCamera.markDirty();
        if (window.FerrariRAF && window.FerrariRAF.markDataDirty) window.FerrariRAF.markDataDirty();
        window.FerrariHUD && window.FerrariHUD.updateDraw('division-curva', 0);
        window.FerrariUI && window.FerrariUI.showToast(
          'Medianera reemplazada: ambos lotes comparten ahora la curva punteada.',
          'success'
        );
        return;
      }

      const split = _splitLoteLibre(smooth);
      if (split) {
        window.FerrariState.removeLine(split.source.id);
        split.lotes.forEach(function (lote) {
          window.FerrariState.addLine(lote);
        });
        window.FerrariOverlay.startDrawing([]);
        _removePreview();
        if (window.FerrariCamera) window.FerrariCamera.markDirty();
        if (window.FerrariRAF && window.FerrariRAF.markDataDirty) window.FerrariRAF.markDataDirty();
        window.FerrariHUD && window.FerrariHUD.updateDraw('division-curva', 0);
        window.FerrariUI && window.FerrariUI.showToast(
          'Lote Libre subdividido: se crearon dos nuevos Lotes Libres.',
          'success'
        );
        return;
      }
      if (_curveInsideLoteLibre(smooth)) {
        window.FerrariUI && window.FerrariUI.showToast(
          'Para subdividir, comienza y termina la curva tocando dos bordes del Lote Libre.',
          'info'
        );
        return;
      }
    }

    window.FerrariState.addLine({
      tipo: 'division-curva',
      puntos: smooth,
      cerrada: _closed,
      grosorPx: _widthPx,
      dashPx: _dashPx,
      gapPx: _gapPx,
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

  function _splitLoteLibre(smoothPoints) {
    const lots = (window.allDrawnLines || []).filter(function (line) {
      return line.tipo === 'lote-libre' && line.puntos && line.puntos.length >= 3;
    });
    if (!lots.length || smoothPoints.length < 2) return null;

    const startGround = _toGround(smoothPoints[0]);
    const endGround = _toGround(smoothPoints[smoothPoints.length - 1]);
    let best = null;

    lots.forEach(function (lot) {
      const polygon = lot.puntos.map(_toGround);
      const start = _nearestOnBoundary(startGround, polygon);
      const end = _nearestOnBoundary(endGround, polygon);
      if (!start || !end || start.dist > EDGE_SNAP_M || end.dist > EDGE_SNAP_M) return;
      if (start.edge === end.edge && Math.abs(start.t - end.t) < 0.04) return;
      const mid = _toGround(smoothPoints[Math.floor(smoothPoints.length / 2)]);
      if (!_pointInPolygon(mid, polygon)) return;
      const score = start.dist + end.dist;
      if (!best || score < best.score) best = { lot: lot, polygon: polygon, start: start, end: end, score: score };
    });
    if (!best) return null;

    const snappedStart = _toSphere(best.start.point);
    const snappedEnd = _toSphere(best.end.point);
    const divider = smoothPoints.map(function (point) { return point.slice(); });
    divider[0] = snappedStart;
    divider[divider.length - 1] = snappedEnd;

    const boundaryA = _boundaryPath(best.lot.puntos, best.start, best.end);
    const boundaryB = _boundaryPath(best.lot.puntos, best.end, best.start);
    if (boundaryA.length < 2 || boundaryB.length < 2) return null;

    const polygonA = _dedupePoints(boundaryA.concat(divider.slice().reverse().slice(1, -1)));
    const polygonB = _dedupePoints(boundaryB.concat(divider.slice(1, -1)));
    if (polygonA.length < 3 || polygonB.length < 3) return null;

    const parent = best.lot;
    const baseTitle = parent.titulo || 'Lote';
    const base = {};
    Object.keys(parent).forEach(function (key) {
      if (key === 'id' || key === 'puntos' || key.charAt(0) === '_') return;
      base[key] = parent[key];
    });
    base.tipo = 'lote-libre';
    base.subdivididoDe = parent.id;
    base.divisionDashPx = _dashPx;
    base.divisionGapPx = _gapPx;
    base.createdAt = Date.now();

    const areaA = window.FerrariMathScale.calculateGroundArea(polygonA, ALTITUDE_M);
    const areaB = window.FerrariMathScale.calculateGroundArea(polygonB, ALTITUDE_M);

    return {
      source: parent,
      lotes: [
        Object.assign({}, base, {
          puntos: polygonA,
          titulo: baseTitle + ' A',
          dimensiones: Math.round(areaA).toString(),
          hasSmartPin: false
        }),
        Object.assign({}, base, {
          puntos: polygonB,
          titulo: baseTitle + ' B',
          dimensiones: Math.round(areaB).toString(),
          hasSmartPin: false
        })
      ]
    };
  }

  /**
   * Si ya existen dos lotes unidos por una arista recta, sustituye esa arista
   * en ambos polígonos por la curva recién trazada. Evita conservar el cordón
   * sólido debajo de una división punteada independiente.
   */
  function _reshapeExistingMedianera(smoothPoints) {
    if (!smoothPoints || smoothPoints.length < 2) return null;
    const lots = (window.allDrawnLines || []).filter(function (line) {
      return line.tipo === 'lote-libre' && line.puntos && line.puntos.length >= 3;
    });
    if (lots.length < 2) return null;

    const startGround = _toGround(smoothPoints[0]);
    const endGround = _toGround(smoothPoints[smoothPoints.length - 1]);
    const candidates = [];

    lots.forEach(function (lot) {
      const polygon = lot.puntos.map(_toGround);
      const start = _nearestOnBoundary(startGround, polygon);
      const end = _nearestOnBoundary(endGround, polygon);
      if (!start || !end || start.dist > EDGE_SNAP_M || end.dist > EDGE_SNAP_M) return;
      if (start.edge === end.edge && Math.abs(start.t - end.t) < 0.04) return;

      const pathA = _boundaryPath(lot.puntos, start, end);
      const pathB = _boundaryPath(lot.puntos, end, start);
      const lengthA = _spherePathLength(pathA);
      const lengthB = _spherePathLength(pathB);
      const replaceA = lengthA <= lengthB;
      candidates.push({
        lot: lot,
        start: start,
        end: end,
        oldPath: replaceA ? pathA : pathB.slice().reverse(),
        preservedPath: replaceA ? pathB : pathA,
        preservedStartsAtEnd: replaceA,
        score: start.dist + end.dist
      });
    });
    if (candidates.length < 2) return null;

    // Solo transformar cuando dos lotes comparten la misma medianera previa.
    // Se comparan los extremos y la longitud para tolerar pequeñas diferencias antiguas.
    let pair = null;
    for (let i = 0; i < candidates.length && !pair; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        if (!_sameMedianera(candidates[i].oldPath, candidates[j].oldPath)) continue;
        pair = [candidates[i], candidates[j]];
        break;
      }
    }
    if (!pair) return null;

    const divider = smoothPoints.map(function (point) { return point.slice(); });
    divider[0] = _toSphere(pair[0].start.point);
    divider[divider.length - 1] = _toSphere(pair[0].end.point);

    const updated = pair.map(function (candidate) {
      let polygon;
      const perimeter = candidate.preservedPath.map(function (point) { return point.slice(); });
      if (candidate.preservedStartsAtEnd) {
        // end → perímetro exterior → start → curva → end
        perimeter[0] = divider[divider.length - 1].slice();
        perimeter[perimeter.length - 1] = divider[0].slice();
        polygon = _dedupePoints(perimeter.concat(divider.slice(1, -1)));
      } else {
        // start → perímetro exterior → end → curva inversa → start
        perimeter[0] = divider[0].slice();
        perimeter[perimeter.length - 1] = divider[divider.length - 1].slice();
        polygon = _dedupePoints(perimeter.concat(divider.slice().reverse().slice(1, -1)));
      }
      return Object.assign({}, candidate.lot, {
        puntos: polygon,
        divisionDashPx: _dashPx,
        divisionGapPx: _gapPx
      });
    });
    if (updated.some(function (line) { return !line.puntos || line.puntos.length < 3; })) return null;
    return { lotes: updated };
  }

  function _repairStandaloneMedianeras() {
    const attempted = new Set();
    let repaired = 0;
    let guard = 0;
    while (guard++ < 30) {
      const division = (window.allDrawnLines || []).find(function (line) {
        return line.tipo === 'division-curva' && !line.cerrada && !attempted.has(line.id);
      });
      if (!division) break;
      attempted.add(division.id);
      const result = _reshapeExistingMedianera(division.puntos);
      if (!result) continue;

      const replacements = new Map(result.lotes.map(function (line) { return [line.id, line]; }));
      const next = (window.allDrawnLines || [])
        .filter(function (line) { return line.id !== division.id; })
        .map(function (line) { return replacements.get(line.id) || line; });
      window.FerrariState.replaceAll(next);
      repaired++;
    }
    if (repaired) {
      if (window.FerrariCamera) window.FerrariCamera.markDirty();
      if (window.FerrariRAF && window.FerrariRAF.markDataDirty) window.FerrariRAF.markDataDirty();
    }
    return repaired;
  }

  function _spherePathLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const a = _toGround(points[i - 1]);
      const b = _toGround(points[i]);
      length += Math.hypot(b.x - a.x, b.z - a.z);
    }
    return length;
  }

  function _sameMedianera(pathA, pathB) {
    if (!pathA || !pathB || pathA.length < 2 || pathB.length < 2) return false;
    const a0 = _toGround(pathA[0]);
    const a1 = _toGround(pathA[pathA.length - 1]);
    const b0 = _toGround(pathB[0]);
    const b1 = _toGround(pathB[pathB.length - 1]);
    const direct = Math.hypot(a0.x - b0.x, a0.z - b0.z) + Math.hypot(a1.x - b1.x, a1.z - b1.z);
    const reverse = Math.hypot(a0.x - b1.x, a0.z - b1.z) + Math.hypot(a1.x - b0.x, a1.z - b0.z);
    const lenA = _spherePathLength(pathA);
    const lenB = _spherePathLength(pathB);
    return Math.min(direct, reverse) <= EDGE_SNAP_M * 2 && Math.abs(lenA - lenB) <= Math.max(EDGE_SNAP_M * 2, Math.min(lenA, lenB) * 0.18);
  }

  function _toGround(point) {
    return window.FerrariMathScale.pitchYawToGround(point[0], point[1], ALTITUDE_M);
  }

  function _toSphere(point) {
    const sphere = window.FerrariMathScale.groundToPitchYaw(point.x, point.z, ALTITUDE_M);
    return [sphere.pitch, sphere.yaw];
  }

  function _nearestOnBoundary(point, polygon) {
    let best = null;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-9 ? ((point.x - a.x) * dx + (point.z - a.z) * dz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const q = { x: a.x + dx * t, z: a.z + dz * t };
      const dist = Math.hypot(point.x - q.x, point.z - q.z);
      if (!best || dist < best.dist) best = { edge: i, t: t, point: q, dist: dist };
    }
    return best;
  }

  function _boundaryPath(points, from, to) {
    const output = [_toSphere(from.point)];
    if (from.edge === to.edge && from.t > to.t) {
      for (let step = 0; step < points.length; step++) {
        output.push(points[(from.edge + 1 + step) % points.length].slice());
      }
      output.push(_toSphere(to.point));
      return output;
    }
    let edge = from.edge;
    let guard = 0;
    while (edge !== to.edge && guard++ <= points.length) {
      output.push(points[(edge + 1) % points.length].slice());
      edge = (edge + 1) % points.length;
    }
    output.push(_toSphere(to.point));
    return output;
  }

  function _curveInsideLoteLibre(points) {
    if (!points.length) return false;
    const sample = _toGround(points[Math.floor(points.length / 2)]);
    return (window.allDrawnLines || []).some(function (line) {
      return line.tipo === 'lote-libre' && line.puntos && line.puntos.length >= 3 &&
        _pointInPolygon(sample, line.puntos.map(_toGround));
    });
  }

  function _pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      const crosses = ((a.z > point.z) !== (b.z > point.z)) &&
        (point.x < (b.x - a.x) * (point.z - a.z) / ((b.z - a.z) || 1e-9) + a.x);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function _dedupePoints(points) {
    const output = [];
    points.forEach(function (point) {
      const last = output[output.length - 1];
      if (!last || Math.abs(last[0] - point[0]) > 1e-7 || Math.abs(last[1] - point[1]) > 1e-7) {
        output.push(point);
      }
    });
    if (output.length > 2) {
      const first = output[0];
      const last = output[output.length - 1];
      if (Math.abs(first[0] - last[0]) < 1e-7 && Math.abs(first[1] - last[1]) < 1e-7) output.pop();
    }
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
    el.setAttribute('stroke-dasharray', _dashPx + ' ' + _gapPx);
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

  window.FerrariDrawDivision = {
    activate,
    deactivate,
    isActive,
    bindEvents,
    finish,
    reshapeExistingMedianera: _reshapeExistingMedianera,
    repairStandaloneMedianeras: _repairStandaloneMedianeras
  };
  console.log('[Ferrari/DivisiónCurva] ✓ Módulo inicializado');
})();
