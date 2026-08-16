/**
 * f-draw-lote.js — Herramienta de dibujo de lotes (Lote Libre / Orgánico)
 *
 * REGLAS:
 * - Registrar eventos UNA SOLA VEZ (flag _bound)
 * - capture: false en todos los listeners (Lección 2)
 * - mouseEventToCoords(e) → [pitch, yaw] desde Pannellum
 * - Puntos almacenados como [pitch, yaw] en coordenadas esféricas
 * - deactivateAllTools() SIEMPRE antes de activar (Lección 2)
 *
 * Controles:
 *   Click izquierdo → agregar vértice
 *   Click en primer vértice (hover) → cerrar polígono
 *   Doble-click → cerrar y finalizar
 *   Enter        → finalizar polígono
 *   Backspace/Z  → deshacer último vértice
 *   Escape       → cancelar
 */

'use strict';

(function() {

  let _activeTool   = null;   // 'lote-libre' | 'lote-organico' | null
  let _bound        = false;  // Guard: listeners registrados solo una vez
  const GROUND_ALTITUDE_M = 120;
  const LOT_EDGE_SNAP_M = 12;

  // ─── ACTIVACIÓN / DESACTIVACIÓN ───────────────────────────────────

  function activate(tipo) {
    // Lección 2: siempre desactivar todo antes de activar
    window.FerrariTools.deactivateAllTools();

    _activeTool = tipo;

    // UI
    document.getElementById('panorama-container').classList.add('drawing-active');
    window.FerrariOverlay.startDrawing([]);
    _updateHUD();

    // Deshabilitar el drag de Pannellum durante el dibujo
    _setPannellumDraggable(false);

    window.FerrariHUD && window.FerrariHUD.showDraw(tipo);
    window.FerrariUI  && window.FerrariUI.showToast(`Herramienta: ${_label(tipo)}. Click para colocar vértices.`, 'info');

    console.log('[Ferrari/DrawLote] Herramienta activada:', tipo);
  }

  function deactivate() {
    if (!_activeTool) return;
    _activeTool = null;

    document.getElementById('panorama-container').classList.remove('drawing-active');
    window.FerrariOverlay.clearOverlay();
    _setPannellumDraggable(true);

    window.FerrariHUD && window.FerrariHUD.hideDraw();
    console.log('[Ferrari/DrawLote] Herramienta desactivada');
  }

  function isActive() {
    return _activeTool !== null;
  }

  function getActiveTool() {
    return _activeTool;
  }

  // ─── EVENTOS ──────────────────────────────────────────────────────

  /**
   * Registra todos los listeners UNA SOLA VEZ.
   * Llamado en DOMContentLoaded desde f-panel.js.
   */
  function bindEvents() {
    if (_bound) return;
    _bound = true;

    const container = document.getElementById('pannellum-viewer');

    // Click para agregar vértice (capture: false — Lección 2)
    container.addEventListener('click', _onClick, false);

    // Doble click para cerrar
    container.addEventListener('dblclick', _onDblClick, false);

    // Movimiento del cursor
    container.addEventListener('mousemove', _onMouseMove, false);

    // Touch events
    container.addEventListener('touchstart', _onTouchStart, { passive: false });
    container.addEventListener('touchend',   _onTouchEnd,   { passive: false });

    // Teclado — en documento para no perder foco
    document.addEventListener('keydown', _onKeyDown, false);

    console.log('[Ferrari/DrawLote] ✓ Eventos registrados');
  }

  function _onClick(e) {
    if (!_activeTool) return;
    if (e.button !== 0) return; // solo botón izquierdo

    const coords = _getCoords(e);
    if (!coords) return;

    let [pitch, yaw] = coords;
    [pitch, yaw] = _findSnapPoint(e, pitch, yaw);

    // ¿Cerrar polígono? (click en primer vértice con hover activo)
    if (window.FerrariOverlay.isCloseHover() &&
        window.FerrariOverlay.getActivePoints().length >= 3) {
      _finishPolygon();
      return;
    }

    // Agregar vértice
    window.FerrariOverlay.addPoint(pitch, yaw);
    _updateHUD();
  }

  function _onDblClick(e) {
    if (!_activeTool) return;
    e.preventDefault();
    e.stopPropagation();

    const pts = window.FerrariOverlay.getActivePoints();
    if (pts.length >= 2) {
      // El doble-click agrega un click primero — remover el último duplicado
      window.FerrariOverlay.removeLastPoint();
      _finishPolygon();
    }
  }

  function _onMouseMove(e) {
    if (!_activeTool) return;
    const coords = _getCoords(e);
    if (!coords) return;
    
    const [pitch, yaw] = _findSnapPoint(e, coords[0], coords[1]);
    window.FerrariOverlay.setCursor(pitch, yaw);
  }

  function _onTouchStart(e) {
    if (!_activeTool) return;
    e.preventDefault();
  }

  function _onTouchEnd(e) {
    if (!_activeTool) return;
    e.preventDefault();
    if (e.changedTouches.length === 0) return;

    const touch  = e.changedTouches[0];
    const coords = _getCoords(touch);
    if (!coords) return;

    let [pitch, yaw] = coords;
    [pitch, yaw] = _findSnapPoint(touch, pitch, yaw);

    if (window.FerrariOverlay.isCloseHover() &&
        window.FerrariOverlay.getActivePoints().length >= 3) {
      _finishPolygon();
      return;
    }

    window.FerrariOverlay.addPoint(pitch, yaw);
    _updateHUD();
  }

  function _onKeyDown(e) {
    if (!_activeTool) return;

    switch(e.key) {
      case 'Enter':
        e.preventDefault();
        const pts = window.FerrariOverlay.getActivePoints();
        if (pts.length >= 2) _finishPolygon();
        break;

      case 'Escape':
        e.preventDefault();
        _cancelDrawing();
        break;

      case 'Backspace':
        e.preventDefault();
        window.FerrariOverlay.removeLastPoint();
        _updateHUD();
        break;

      case 'z':
      case 'Z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          window.FerrariOverlay.removeLastPoint();
          _updateHUD();
        }
        break;
    }
  }

  // ─── LÓGICA PRINCIPAL ────────────────────────────────────────────

  /**
   * Finaliza el polígono y lo guarda en allDrawnLines.
   */
  function _finishPolygon() {
    const pts   = window.FerrariOverlay.getActivePoints();
    const tipo  = _activeTool;

    if (pts.length < 2) {
      window.FerrariUI && window.FerrariUI.showToast('Se necesitan al menos 2 vértices.', 'error');
      return;
    }

    // Tres puntos que parten y terminan sobre el perímetro de un Lote Libre
    // representan una subdivisión, no un triángulo independiente. Ambos lotes
    // reutilizan exactamente el mismo trazado para impedir huecos o solapes.
    if (tipo === 'lote-libre' && pts.length === 3) {
      const split = _splitExistingFreeLot(pts);
      if (split) {
        const nextLines = window.allDrawnLines.slice();
        const sourceIndex = nextLines.findIndex(line => line.id === split.source.id);
        if (sourceIndex !== -1) {
          nextLines.splice(sourceIndex, 1, split.lotes[0], split.lotes[1]);
          window.FerrariState.replaceAll(nextLines);
          window.FerrariOverlay.startDrawing([]);
          _updateHUD();
          window.FerrariCamera && window.FerrariCamera.markDirty();
          window.FerrariRAF && window.FerrariRAF.markDataDirty && window.FerrariRAF.markDataDirty();
          window.FerrariUI && window.FerrariUI.showToast(
            'Subdivisión perfecta: se crearon dos Lotes Libres sin espacios.',
            'success'
          );
          return;
        }
      }
    }

    // Contar lotes existentes para autonumerar
    const numLotes = window.allDrawnLines.filter(l => l.tipo.startsWith('lote') || l.tipo.startsWith('franja')).length;

    // Guardar en state
    const id = window.FerrariState.addLine({
      tipo,
      puntos: pts,
      estado: 'disponible',
      titulo: `Lote ${numLotes + 1}`,
      createdAt:  Date.now()
    });

    console.log('[Ferrari/DrawLote] Lote guardado:', id, '→', pts.length, 'vértices');
    window.FerrariUI && window.FerrariUI.showToast(`Lote guardado (${pts.length} vértices)`, 'success');

    // Limpiar overlay y comenzar uno nuevo
    window.FerrariOverlay.startDrawing([]);
    _updateHUD();
  }

  /**
   * Cancela el dibujo activo.
   */
  function _cancelDrawing() {
    window.FerrariOverlay.clearOverlay();
    window.FerrariOverlay.startDrawing([]);
    _updateHUD();
    window.FerrariUI && window.FerrariUI.showToast('Dibujo cancelado.', 'info');
  }

  // ─── HELPERS ────────────────────────────────────────────────────

  const SNAP_RADIUS_PX = 12;

  /**
   * Busca si el cursor está cerca de algún vértice existente para hacer Snap magnético.
   */
  function _findSnapPoint(e, rawPitch, rawYaw) {
    if (!window.FerrariCamera) return [rawPitch, rawYaw];
    if (!window.allDrawnLines) window.allDrawnLines = [];

    const rect = document.getElementById('pannellum-viewer').getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.changedTouches ? e.changedTouches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.changedTouches ? e.changedTouches[0].clientY : 0);
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const proj = window.FerrariCamera.getProjectionParams();
    let snapDistVertex = Infinity;
    let snapPitchVertex = null;
    let snapYawVertex = null;

    let snapDistEdge = Infinity;
    let snapPitchEdge = null;
    let snapYawEdge = null;

    for (const line of window.allDrawnLines) {
      if (!line.puntos) continue;
      
      const isCalle = (line.tipo === 'calle' || line.tipo === 'calle-curva-arq2');
      const isLote = (line.tipo === 'lote-libre' || line.tipo === 'lote-organico');
      const snapPoints = isCalle ? (line._streetPolygon || line.puntos) : line.puntos;

      const getClosestOnSegment = (px, py, x1, y1, x2, y2) => {
        const l2 = (x2 - x1)**2 + (y2 - y1)**2;
        if (l2 === 0) return { x: x1, y: y1 };
        let t = ((px - x1)*(x2 - x1) + (py - y1)*(y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
      };

      // 1. Siempre evaluar vértices primero (prioridad máxima)
      for (const pt of snapPoints) {
        const cam = window.FerrariCamera.getCam(pt[0], pt[1]);
        if (cam.z <= 0.0001) continue;
        
        const pxPt = window.FerrariCamera.camToPixel(cam, proj);
        const dist = Math.sqrt((pxPt.px - mx)**2 + (pxPt.py - my)**2);
        
        if (dist < SNAP_RADIUS_PX && dist < snapDistVertex) {
          snapDistVertex = dist;
          snapPitchVertex = pt[0];
          snapYawVertex = pt[1];
        }
      }

      // 2. Calles y lotes permiten capturar cualquier punto de su borde.
      // Esto hace que el cierre compartido sea matemáticamente idéntico.
      if ((isCalle && line._streetPolygon) || isLote) {
        for (let j = 0; j < snapPoints.length; j++) {
          const pt1 = snapPoints[j];
          const isClosed = isLote || !!line._streetPolygon;
          if (!isClosed && j === snapPoints.length - 1) break;
          const pt2 = snapPoints[(j + 1) % snapPoints.length];

          const cam1 = window.FerrariCamera.getCam(pt1[0], pt1[1]);
          const cam2 = window.FerrariCamera.getCam(pt2[0], pt2[1]);
          if (cam1.z <= 0.0001 || cam2.z <= 0.0001) continue;

          const s1 = window.FerrariCamera.camToPixel(cam1, proj);
          const s2 = window.FerrariCamera.camToPixel(cam2, proj);

          const closest = getClosestOnSegment(mx, my, s1.px, s1.py, s2.px, s2.py);
          const dist = Math.sqrt((closest.x - mx)**2 + (closest.y - my)**2);

          if (dist < SNAP_RADIUS_PX && dist < snapDistEdge) {
            snapDistEdge = dist;
            const viewer = window.Ferrari && window.Ferrari.viewer;
            if (viewer) {
              const res = viewer.mouseEventToCoords({
                clientX: closest.x + rect.left,
                clientY: closest.y + rect.top
              });
              snapPitchEdge = res[0];
              snapYawEdge = res[1];
            }
          }
        }
      }
    }

    // 1b. Vértices del calco KMZ (prioridad al calco para calcado preciso)
    if (window.FerrariKmzCalco && window.FerrariKmzCalco.findSnapNearPixel) {
      const kmzSnap = window.FerrariKmzCalco.findSnapNearPixel(mx, my, SNAP_RADIUS_PX + 4);
      if (kmzSnap) {
        snapDistVertex = 0;
        snapPitchVertex = kmzSnap[0];
        snapYawVertex = kmzSnap[1];
      }
    }
    
    // Seleccionar el snap más cercano (borde vs vértice)
    let bestPitch = rawPitch;
    let bestYaw = rawYaw;
    
    if (snapPitchVertex !== null && snapPitchEdge !== null) {
      // Prioridad sutil al vértice si la diferencia es mínima (ej: 5px)
      if (snapDistVertex <= snapDistEdge + 5) {
        bestPitch = snapPitchVertex;
        bestYaw = snapYawVertex;
      } else {
        bestPitch = snapPitchEdge;
        bestYaw = snapYawEdge;
      }
    } else if (snapPitchVertex !== null) {
      bestPitch = snapPitchVertex;
      bestYaw = snapYawVertex;
    } else if (snapPitchEdge !== null) {
      bestPitch = snapPitchEdge;
      bestYaw = snapYawEdge;
    }

    return [bestPitch, bestYaw];
  }

  /**
   * Divide un Lote Libre cuando una polilínea de tres puntos une dos bordes
   * y su punto central cae dentro del lote.
   */
  function _splitExistingFreeLot(points) {
    const math = window.FerrariMathScale;
    if (!math || points.length !== 3) return null;

    const startGround = _lotPointToGround(points[0]);
    const middleGround = _lotPointToGround(points[1]);
    const endGround = _lotPointToGround(points[2]);
    const candidates = (window.allDrawnLines || []).filter(line =>
      line.tipo === 'lote-libre' && line.puntos && line.puntos.length >= 3
    );
    let best = null;

    candidates.forEach(lot => {
      const polygon = lot.puntos.map(_lotPointToGround);
      const start = _nearestLotBoundary(startGround, polygon);
      const end = _nearestLotBoundary(endGround, polygon);
      if (!start || !end || start.dist > LOT_EDGE_SNAP_M || end.dist > LOT_EDGE_SNAP_M) return;
      if (start.edge === end.edge && Math.abs(start.t - end.t) < 0.04) return;
      const score = start.dist + end.dist;
      if (!best || score < best.score) {
        best = { lot, polygon, start, end, score };
      }
    });
    if (!best) return null;

    const divider = points.map(point => point.slice());
    divider[0] = _lotPointToSphere(best.start.point);
    divider[divider.length - 1] = _lotPointToSphere(best.end.point);

    // Si el punto central está fuera, se está creando un lote adyacente.
    // Cerramos siguiendo el tramo más corto del perímetro existente, incluso
    // cuando ese tramo es curvo o contiene varios vértices.
    if (!_pointInsideLot(middleGround, best.polygon)) {
      const forwardClosure = _lotBoundaryPath(best.lot.puntos, best.end, best.start);
      const backwardClosure = _lotBoundaryPath(best.lot.puntos, best.start, best.end).reverse();
      const closure = _lotPathLength(forwardClosure) <= _lotPathLength(backwardClosure)
        ? forwardClosure
        : backwardClosure;
      const newPolygon = _dedupeLotPoints(divider.concat(closure.slice(1, -1)));
      if (newPolygon.length < 3) return null;

      const sourcePoints = _insertLotBoundaryPoints(best.lot.puntos, [best.start, best.end]);
      const updatedSource = Object.assign({}, best.lot, { puntos: sourcePoints });
      const lotCount = (window.allDrawnLines || []).filter(line =>
        line.tipo && (line.tipo.startsWith('lote') || line.tipo.startsWith('franja'))
      ).length;
      const area = math.calculateGroundArea(newPolygon, GROUND_ALTITUDE_M);
      if (!isFinite(area) || area < 1) return null;

      return {
        source: best.lot,
        adjacent: true,
        lotes: [
          updatedSource,
          {
            id: window.FerrariState.generateId(),
            tipo: 'lote-libre',
            puntos: newPolygon,
            estado: 'disponible',
            titulo: 'Lote ' + (lotCount + 1),
            dimensiones: Math.round(area).toString(),
            hasSmartPin: false,
            createdAt: Date.now()
          }
        ]
      };
    }

    const boundaryA = _lotBoundaryPath(best.lot.puntos, best.start, best.end);
    const boundaryB = _lotBoundaryPath(best.lot.puntos, best.end, best.start);
    const polygonA = _dedupeLotPoints(boundaryA.concat(divider.slice().reverse().slice(1, -1)));
    const polygonB = _dedupeLotPoints(boundaryB.concat(divider.slice(1, -1)));
    if (polygonA.length < 3 || polygonB.length < 3) return null;

    const parent = best.lot;
    const base = {};
    Object.keys(parent).forEach(key => {
      if (key === 'id' || key === 'puntos' || key.charAt(0) === '_') return;
      base[key] = parent[key];
    });
    base.tipo = 'lote-libre';
    base.createdAt = Date.now();
    base.hasSmartPin = false;

    const baseTitle = parent.titulo || 'Lote';
    const areaA = math.calculateGroundArea(polygonA, GROUND_ALTITUDE_M);
    const areaB = math.calculateGroundArea(polygonB, GROUND_ALTITUDE_M);

    return {
      source: parent,
      lotes: [
        Object.assign({}, base, {
          id: window.FerrariState.generateId(),
          puntos: polygonA,
          titulo: baseTitle + ' A',
          dimensiones: Math.round(areaA).toString()
        }),
        Object.assign({}, base, {
          id: window.FerrariState.generateId(),
          puntos: polygonB,
          titulo: baseTitle + ' B',
          dimensiones: Math.round(areaB).toString()
        })
      ]
    };
  }

  function _lotPointToGround(point) {
    return window.FerrariMathScale.pitchYawToGround(point[0], point[1], GROUND_ALTITUDE_M);
  }

  function _lotPointToSphere(point) {
    const sphere = window.FerrariMathScale.groundToPitchYaw(point.x, point.z, GROUND_ALTITUDE_M);
    return [sphere.pitch, sphere.yaw];
  }

  function _nearestLotBoundary(point, polygon) {
    let best = null;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length2 = dx * dx + dz * dz;
      let t = length2 > 1e-9 ? ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2 : 0;
      t = Math.max(0, Math.min(1, t));
      const projected = { x: a.x + dx * t, z: a.z + dz * t };
      const dist = Math.hypot(point.x - projected.x, point.z - projected.z);
      if (!best || dist < best.dist) best = { edge: i, t, point: projected, dist };
    }
    return best;
  }

  function _lotBoundaryPath(points, from, to) {
    const output = [_lotPointToSphere(from.point)];
    if (from.edge === to.edge && from.t > to.t) {
      for (let step = 0; step < points.length; step++) {
        output.push(points[(from.edge + 1 + step) % points.length].slice());
      }
      output.push(_lotPointToSphere(to.point));
      return output;
    }
    let edge = from.edge;
    let guard = 0;
    while (edge !== to.edge && guard++ <= points.length) {
      output.push(points[(edge + 1) % points.length].slice());
      edge = (edge + 1) % points.length;
    }
    output.push(_lotPointToSphere(to.point));
    return output;
  }

  function _lotPathLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const a = _lotPointToGround(points[i - 1]);
      const b = _lotPointToGround(points[i]);
      length += Math.hypot(b.x - a.x, b.z - a.z);
    }
    return length;
  }

  function _insertLotBoundaryPoints(points, snaps) {
    const byEdge = {};
    snaps.forEach(snap => {
      if (snap.t <= 1e-7 || snap.t >= 1 - 1e-7) return;
      if (!byEdge[snap.edge]) byEdge[snap.edge] = [];
      byEdge[snap.edge].push({ t: snap.t, point: _lotPointToSphere(snap.point) });
    });

    const output = [];
    for (let i = 0; i < points.length; i++) {
      output.push(points[i].slice());
      const inserts = (byEdge[i] || []).sort((a, b) => a.t - b.t);
      inserts.forEach(item => output.push(item.point));
    }
    return _dedupeLotPoints(output);
  }

  function _pointInsideLot(point, polygon) {
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

  function _dedupeLotPoints(points) {
    const output = [];
    points.forEach(point => {
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

  /**
   * Obtiene coordenadas esféricas [pitch, yaw] desde un evento.
   * Usa mouseEventToCoords interno de Pannellum.
   */
  function _getCoords(e) {
    const viewer = window.Ferrari && window.Ferrari.viewer;
    if (!viewer) return null;
    try {
      // mouseEventToCoords es la función pública de Pannellum
      return viewer.mouseEventToCoords(e);
    } catch(err) {
      // Fallback manual si mouseEventToCoords no está disponible
      return _manualCoords(e);
    }
  }

  /**
   * Fallback: proyección inversa manual.
   */
  function _manualCoords(e) {
    const viewer = window.Ferrari && window.Ferrari.viewer;
    if (!viewer) return null;

    const container = document.getElementById('pannellum-viewer');
    const rect      = container.getBoundingClientRect();

    const clientX = e.clientX !== undefined ? e.clientX : (e.pageX - window.scrollX);
    const clientY = e.clientY !== undefined ? e.clientY : (e.pageY - window.scrollY);

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    let hfov = 90;
    try { hfov = viewer.getHfov(); } catch(e) {}
    let pitch = 0, yaw = 0;
    try { pitch = viewer.getPitch(); yaw = viewer.getYaw(); } catch(e) {}

    const f = 1 / Math.tan(hfov * Math.PI / 360);
    const nx = (x / w) * 2 - 1;
    const ny = 1 - (y / h) * 2;
    const ny2 = ny * h / w;

    const n   = Math.sqrt(nx * nx + ny2 * ny2 + f * f);
    const sp  = Math.sin(pitch * Math.PI / 180);
    const cp2 = Math.cos(pitch * Math.PI / 180);

    // Lección 7: clampear Math.asin
    const pitchOut = Math.asin(Math.min(1, Math.max(-1,
      (ny2 * cp2 + f * sp) / n
    ))) * 180 / Math.PI;

    const yawOut = Math.atan2(nx, f * cp2 - ny2 * sp) * 180 / Math.PI + yaw;

    return [pitchOut, yawOut];
  }

  function _setPannellumDraggable(enabled) {
    // Pannellum no tiene setDraggable en la API pública,
    // pero podemos suprimir eventos con CSS pointer-events en el canvas
    const canvas = document.querySelector('#pannellum-viewer canvas');
    if (canvas) {
      canvas.style.pointerEvents = enabled ? 'auto' : 'none';
    }
    // El div de Pannellum sigue recibiendo eventos del container
    const pnlm = document.querySelector('#pannellum-viewer .pnlm-container');
    if (pnlm) {
      pnlm.style.pointerEvents = enabled ? 'auto' : 'none';
    }
  }

  function _label(tipo) {
    const labels = {
      'lote-libre':    'Lote Libre',
      'lote-organico': 'Lote Orgánico'
    };
    return labels[tipo] || tipo;
  }

  function _updateHUD() {
    const pts = window.FerrariOverlay.getActivePoints();
    window.FerrariHUD && window.FerrariHUD.updateDraw(_activeTool, pts.length);
  }

  // ─── API PÚBLICA ────────────────────────────────────────────────────
  window.FerrariDrawLote = {
    activate,
    deactivate,
    isActive,
    getActiveTool,
    bindEvents,
    splitExistingFreeLot: _splitExistingFreeLot
  };

  console.log('[Ferrari/DrawLote] ✓ Módulo inicializado');

})();
