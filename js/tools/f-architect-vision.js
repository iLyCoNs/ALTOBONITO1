/* f-architect-vision.js — lectura visual asistida para el modo Arquitecto */
'use strict';

(function () {
  let _active = false;
  let _panel = null;
  let _lastResult = null;
  const ENDPOINT = window.ARCHITECT_VISION_ENDPOINT || 'http://localhost:8787/api/architect/analyze';

  function _toast(message, type) {
    if (window.FerrariUI && window.FerrariUI.showToast) window.FerrariUI.showToast(message, type || 'info');
  }

  function _ensurePanel() {
    if (_panel) return _panel;
    _panel = document.createElement('section');
    _panel.id = 'architect-vision-panel';
    _panel.style.cssText = 'position:fixed;right:22px;top:86px;width:min(390px,calc(100vw - 44px));z-index:80;padding:18px;border:1px solid rgba(255,255,255,.28);border-radius:18px;background:rgba(17,25,38,.94);backdrop-filter:blur(18px);box-shadow:0 18px 50px rgba(0,0,0,.42);color:#fff;font:500 13px/1.4 system-ui,sans-serif';
    _panel.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><strong style="font-size:15px;letter-spacing:.02em">Lectura IA del plano</strong><button data-action="close" style="margin-left:auto;border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:50%;width:28px;height:28px;cursor:pointer">×</button></div>' +
      '<p style="margin:0 0 12px;color:rgba(255,255,255,.74)">Analiza el encuadre visible y propone calles, lotes y divisiones. Revísalos antes de incorporarlos.</p>' +
      '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;color:rgba(255,255,255,.78)"><input data-role="include-existing" type="checkbox" checked> considerar la geometría ya dibujada</label>' +
      '<button data-action="analyze" style="width:100%;padding:11px 14px;border:0;border-radius:11px;background:linear-gradient(135deg,#00c6ff,#0072ff);color:#fff;font-weight:700;cursor:pointer">Analizar vista actual</button>' +
      '<div data-role="status" style="margin-top:12px;color:rgba(255,255,255,.78);white-space:pre-wrap"></div>' +
      '<button data-action="apply" hidden style="width:100%;margin-top:12px;padding:11px 14px;border:1px solid rgba(118,255,213,.7);border-radius:11px;background:rgba(28,180,130,.22);color:#d8fff3;font-weight:700;cursor:pointer">Aplicar geometría detectada</button>';
    document.body.appendChild(_panel);
    _panel.addEventListener('click', function (event) {
      const action = event.target && event.target.dataset && event.target.dataset.action;
      if (action === 'close') deactivate();
      if (action === 'analyze') analyzeCurrentView();
      if (action === 'apply') applyResult();
    });
    return _panel;
  }

  function _status(text) {
    const el = _panel && _panel.querySelector('[data-role="status"]');
    if (el) el.textContent = text || '';
  }

  function _getCanvas() {
    const viewer = window.Ferrari && window.Ferrari.viewer;
    if (!viewer || !viewer.getRenderer) return null;
    const renderer = viewer.getRenderer();
    return renderer && renderer.getCanvas ? renderer.getCanvas() : null;
  }

  function _parseJSON(content) {
    let text = String(content || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try { return JSON.parse(text); } catch (err) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
      throw new Error('La respuesta de la IA no contiene JSON válido.');
    }
  }

  function _normalizeResult(raw) {
    const input = raw && Array.isArray(raw.elements) ? raw.elements : [];
    const elements = input.map(function (item) {
      const type = item && (item.type === 'street' || item.type === 'lot' || item.type === 'division') ? item.type : null;
      const points = item && Array.isArray(item.points) ? item.points.map(function (p) {
        return { x: Math.max(0, Math.min(1, Number(p.x))), y: Math.max(0, Math.min(1, Number(p.y))) };
      }).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
      const minimum = type === 'lot' ? 3 : 2;
      return type && points.length >= minimum ? {
        type,
        label: String(item.label || '').slice(0, 80),
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
        points
      } : null;
    }).filter(Boolean);
    return { elements };
  }

  async function analyzeCurrentView() {
    const canvas = _getCanvas();
    if (!canvas) return _toast('La panorámica todavía no está lista.', 'error');
    const button = _panel && _panel.querySelector('[data-action="analyze"]');
    if (button) { button.disabled = true; button.textContent = 'Analizando…'; }
    _lastResult = null;
    if (_panel) _panel.querySelector('[data-action="apply"]').hidden = true;
    _status('Enviando el encuadre visible al proxy seguro…');
    try {
      const includeExisting = !!(_panel && _panel.querySelector('[data-role="include-existing"]:checked'));
      const image = canvas.toDataURL('image/jpeg', 0.86);
      const instruction = includeExisting
        ? 'Usa las líneas visibles de la imagen y considera que las geometrías existentes pueden ser referencias, no las dupliques innecesariamente.'
        : 'Ignora cualquier dibujo superpuesto y lee únicamente la fotografía de fondo.';
      const response = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image, instruction })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'El proxy no pudo completar el análisis.');
      _lastResult = _normalizeResult(_parseJSON(body.content));
      const counts = _lastResult.elements.reduce((acc, item) => { acc[item.type]++; return acc; }, { street: 0, lot: 0, division: 0 });
      _status('Detectados: ' + counts.street + ' calles · ' + counts.lot + ' lotes · ' + counts.division + ' divisiones.\nRevisa el encuadre y aplica solo si la lectura coincide.');
      if (_panel) _panel.querySelector('[data-action="apply"]').hidden = !_lastResult.elements.length;
    } catch (error) {
      _status('No se pudo analizar: ' + (error.message || error));
      _toast('La lectura IA no pudo completarse.', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Analizar vista actual'; }
    }
  }

  function _toSphere(point, rect) {
    const viewer = window.Ferrari && window.Ferrari.viewer;
    if (!viewer || !viewer.mouseEventToCoords) return null;
    const coords = viewer.mouseEventToCoords({
      clientX: rect.left + point.x * rect.width,
      clientY: rect.top + point.y * rect.height
    });
    return coords && Number.isFinite(coords[0]) && Number.isFinite(coords[1]) ? [coords[0], coords[1]] : null;
  }

  function applyResult() {
    if (!_lastResult || !_lastResult.elements.length) return;
    const viewer = window.Ferrari && window.Ferrari.viewer;
    const host = viewer && viewer.getContainer ? viewer.getContainer() : document.getElementById('pannellum-viewer');
    const rect = host && host.getBoundingClientRect ? host.getBoundingClientRect() : null;
    if (!rect) return _toast('No se pudo ubicar el encuadre de la panorámica.', 'error');
    if (!window.FerrariState || !window.FerrariState.addLine) return;
    if (!window.confirm('La IA propone ' + _lastResult.elements.length + ' geometrías. ¿Agregar al proyecto?')) return;

    window.FerrariTools && window.FerrariTools.deactivateAllTools();
    let count = 0;
    _lastResult.elements.forEach(function (item, index) {
      const points = item.points.map(p => _toSphere(p, rect)).filter(Boolean);
      const min = item.type === 'lot' ? 3 : 2;
      if (points.length < min) return;
      const line = {
        tipo: item.type === 'street' ? 'calle' : (item.type === 'division' ? 'division-curva' : 'lote-libre'),
        puntos: points,
        titulo: item.type === 'lot' ? (item.label || 'Lote IA ' + (index + 1)) : '',
        estado: item.type === 'lot' ? 'disponible' : undefined,
        hasSmartPin: false,
        aiGenerated: true,
        aiConfidence: item.confidence
      };
      if (item.type === 'street') line.anchoAngular = 1.0;
      if (item.type === 'division') { line.divisionDashPx = 10; line.divisionGapPx = 22; }
      const id = window.FerrariState.addLine(line);
      if (id && item.type === 'street' && window.FerrariStreetNetwork) window.FerrariStreetNetwork.integrateStreet(id);
      if (id) count++;
    });
    if (window.FerrariSVGSync) window.FerrariSVGSync.syncSVGElements();
    if (window.FerrariRAF && window.FerrariRAF.markDataDirty) window.FerrariRAF.markDataDirty();
    if (window.FerrariCamera) window.FerrariCamera.markDirty();
    _status('Se incorporaron ' + count + ' geometrías. Puedes ajustarlas con Editar Lotes.');
    _toast('Geometría IA incorporada para revisión.', 'success');
  }

  function activate() {
    if (window.FerrariTools) window.FerrariTools.deactivateAllTools();
    _active = true;
    _ensurePanel().style.display = '';
    _toast('Lectura IA: trabaja sobre el encuadre visible de la panorámica.', 'info');
  }
  function deactivate() {
    _active = false;
    if (_panel) _panel.style.display = 'none';
  }
  function isActive() { return _active; }
  function bindEvents() {}

  window.FerrariArchitectVision = { activate, deactivate, isActive, bindEvents, analyzeCurrentView, applyResult };
})();
