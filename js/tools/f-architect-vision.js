/* f-architect-vision.js — lectura visual asistida para el modo Arquitecto */
'use strict';

(function () {
  let _active = false;
  let _panel = null;
  let _backdrop = null;
  let _lastResult = null;
  let _selectedImage = null;
  let _selectedName = '';
  const DEFAULT_ENDPOINT = ((location.protocol === 'http:' || location.protocol === 'https:') && location.hostname !== 'localhost'
    ? '/api/architect/analyze'
    : 'http://localhost:8787/api/architect/analyze');

  function _normalizeEndpoint(value) {
    let endpoint = String(value || '').trim().replace(/\/+$/, '');
    if (!endpoint) return DEFAULT_ENDPOINT;
    if (/\/api\/architect\/analyze(?:\?.*)?$/i.test(endpoint)) return endpoint;
    return endpoint + '/api/architect/analyze';
  }

  function _endpoint() {
    let saved = '';
    try { saved = localStorage.getItem('kpk_architect_vision_endpoint') || ''; } catch (error) {}
    return _normalizeEndpoint(saved || window.ARCHITECT_VISION_ENDPOINT ||
      (window.KPK_CONFIG && window.KPK_CONFIG.architectVisionEndpoint) || DEFAULT_ENDPOINT);
  }

  function _needsVercelAddress() {
    return /\.github\.io$/i.test(location.hostname) && /^\//.test(_endpoint());
  }

  function _toast(message, type) {
    if (window.FerrariUI && window.FerrariUI.showToast) window.FerrariUI.showToast(message, type || 'info');
  }

  function _escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function _ensurePanel() {
    if (_panel) return _panel;
    _backdrop = document.createElement('div');
    _backdrop.id = 'architect-vision-backdrop';
    _backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(3,8,18,.62);backdrop-filter:blur(3px)';
    _backdrop.addEventListener('click', deactivate);
    _panel = document.createElement('section');
    _panel.id = 'architect-vision-panel';
    _panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;z-index:2147483001;padding:24px;border:1px solid rgba(255,255,255,.3);border-radius:22px;background:linear-gradient(145deg,rgba(21,31,48,.98),rgba(8,15,28,.98));backdrop-filter:blur(22px);box-shadow:0 24px 90px rgba(0,0,0,.58);color:#fff;font:500 14px/1.45 system-ui,sans-serif';
    _panel.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div style="width:36px;height:36px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(135deg,#00c6ff,#5b5cff);font-size:19px">✦</div><div><strong style="display:block;font-size:18px;letter-spacing:.01em">Lectura IA del plano</strong><small style="color:rgba(255,255,255,.62)">Modo Arquitecto · análisis visual guiado</small></div><button data-action="close" aria-label="Cerrar" style="margin-left:auto;border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:50%;width:30px;height:30px;font-size:20px;cursor:pointer">×</button></div>' +
      '<p style="margin:12px 0 16px;color:rgba(255,255,255,.78)">Sube una fotografía o analiza la vista 360 actual. La IA identifica calles, lotes y divisiones; luego tú confirmas antes de dibujarlos.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px"><label data-role="file-label" style="display:flex;align-items:center;justify-content:center;min-height:58px;padding:10px;border:1px dashed rgba(114,214,255,.7);border-radius:13px;background:rgba(0,157,255,.1);color:#dff8ff;text-align:center;cursor:pointer">📷 <span style="margin-left:6px">Subir foto desde PC<input data-role="file" type="file" accept="image/jpeg,image/png,image/webp" hidden></span></label><button data-action="use-current" style="min-height:58px;padding:10px;border:1px solid rgba(255,255,255,.22);border-radius:13px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer">🌐<br><small>Usar vista 360 actual</small></button></div>' +
      '<div data-role="preview-wrap" hidden style="margin-bottom:12px;border-radius:13px;overflow:hidden;background:#050b14"><img data-role="preview" alt="Vista seleccionada" style="display:block;width:100%;max-height:190px;object-fit:contain"></div>' +
      '<div style="padding:11px 12px;margin-bottom:12px;border-radius:12px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.72);font-size:12px"><strong style="color:#fff">Cómo funciona:</strong> 1) eliges la imagen · 2) la IA devuelve puntos normalizados · 3) revisas el conteo · 4) confirmas y se crean geometrías editables.<br><span style="display:block;margin-top:6px;color:#ffd88a">Para que encaje exactamente, la foto debe corresponder al mismo encuadre visible de la panorámica 360.</span></div>' +
      '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;color:rgba(255,255,255,.78);font-size:12px"><input data-role="include-existing" type="checkbox" checked> considerar las líneas ya dibujadas como referencia</label>' +
      '<div style="padding:11px 12px;margin-bottom:12px;border:1px solid rgba(114,214,255,.28);border-radius:12px;background:rgba(0,157,255,.07)"><label for="architect-vision-endpoint" style="display:block;margin-bottom:7px;color:#dff8ff;font-size:12px;font-weight:750">Servidor de análisis en Vercel</label><div style="display:flex;gap:7px"><input id="architect-vision-endpoint" data-role="endpoint" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://tu-proyecto.vercel.app" style="min-width:0;flex:1;padding:10px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(0,0,0,.22);color:#fff;outline:none"><button data-action="save-endpoint" type="button" style="padding:9px 12px;border:1px solid rgba(114,214,255,.55);border-radius:9px;background:rgba(0,157,255,.16);color:#e8faff;font-weight:700;cursor:pointer">Guardar y probar</button></div><small style="display:block;margin-top:7px;color:rgba(255,255,255,.58);line-height:1.35">Si abriste la página desde GitHub, pega aquí la dirección completa de tu proyecto Vercel. No pegues la clave NVIDIA.</small></div>' +
      '<div data-role="import-box" style="margin-bottom:12px;padding:12px;border:1px solid rgba(255,207,92,.35);border-radius:12px;background:rgba(255,193,60,.07)">' +
        '<label style="display:block;margin-bottom:7px;color:#ffe3a3;font-size:12px;font-weight:750">🗺 Importar masterplan externo (Krpano)</label>' +
        '<div style="display:flex;gap:7px"><input data-role="import-url" type="url" inputmode="url" spellcheck="false" placeholder="https://otro-tour.com/proyecto/" style="min-width:0;flex:1;padding:9px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(0,0,0,.22);color:#fff;outline:none"><button data-action="import-extract" type="button" style="padding:9px 12px;border:1px solid rgba(255,207,92,.55);border-radius:9px;background:rgba(255,193,60,.16);color:#ffedb8;font-weight:700;cursor:pointer;white-space:nowrap">Extraer</button></div>' +
        '<small style="display:block;margin-top:6px;color:rgba(255,255,255,.55);line-height:1.35">Pega la dirección de un tour Krpano (la carpeta del tour o su tour.xml). Se extraen lotes, hitos y fichas catastrales con coordenadas angulares exactas.</small>' +
        '<div data-role="import-status" style="margin-top:8px;color:rgba(255,255,255,.78);font-size:12px;white-space:pre-wrap"></div>' +
        '<div data-role="import-controls" hidden>' +
          '<div data-role="import-summary" style="margin-bottom:9px;padding:8px 10px;border-radius:9px;background:rgba(0,0,0,.2);color:#ffe3a3;font-size:12px"></div>' +
          '<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px"><span style="width:34px;color:rgba(255,255,255,.7);font-size:11px">Yaw</span><input data-role="mp-yaw" type="range" min="-180" max="180" step="0.1" value="0" style="flex:1;accent-color:#ffcf5c"><output data-role="mp-yaw-val" style="width:52px;text-align:right;color:#ffd97a;font-size:11px">0.0°</output></div>' +
          '<div style="display:flex;align-items:center;gap:7px;margin-bottom:9px"><span style="width:34px;color:rgba(255,255,255,.7);font-size:11px">Pitch</span><input data-role="mp-pitch" type="range" min="-90" max="90" step="0.1" value="0" style="flex:1;accent-color:#ffcf5c"><output data-role="mp-pitch-val" style="width:52px;text-align:right;color:#ffd97a;font-size:11px">0.0°</output></div>' +
          '<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px"><label style="display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.78);font-size:12px;cursor:pointer"><input data-role="mp-ghost" type="checkbox" checked> mostrar sobre el 360</label><span style="flex:1"></span><button data-action="mp-plano" type="button" style="padding:5px 9px;border:1px solid rgba(255,255,255,.25);border-radius:8px;background:rgba(255,255,255,.08);color:#fff;font-size:11px;cursor:pointer">Ver plano PDF</button></div>' +
          '<small style="display:block;color:rgba(255,255,255,.5);line-height:1.4;margin-bottom:9px">Los puntos ámbar son los lotes del masterplan externo; los cian son hitos. Ajusta Yaw/Pitch hasta alinearlos con el terreno (calibración entre vuelos) y haz click en un punto para ver su ficha.</small>' +
          '<button data-action="mp-discard" type="button" style="width:100%;padding:9px;border:1px solid rgba(255,107,107,.5);border-radius:9px;background:rgba(255,80,80,.12);color:#ffc9c9;font-size:12px;font-weight:700;cursor:pointer">Descartar importación</button>' +
        '</div>' +
      '</div>' +
      '<button data-action="analyze" style="width:100%;padding:13px 14px;border:0;border-radius:12px;background:linear-gradient(135deg,#00c6ff,#0072ff);color:#fff;font-weight:750;cursor:pointer">Analizar vista 360 actual</button>' +
      '<div data-role="status" style="margin-top:13px;color:rgba(255,255,255,.8);white-space:pre-wrap"></div>' +
      '<div data-role="details" hidden style="margin-top:10px;padding:10px;border-radius:11px;background:rgba(0,0,0,.2);font-size:12px;color:rgba(255,255,255,.72)"></div>' +
      '<button data-action="apply" hidden style="width:100%;margin-top:13px;padding:13px 14px;border:1px solid rgba(118,255,213,.7);border-radius:12px;background:rgba(28,180,130,.22);color:#d8fff3;font-weight:750;cursor:pointer">Confirmar y dibujar geometría</button>';
    document.body.appendChild(_backdrop);
    document.body.appendChild(_panel);
    const endpointInput = _panel.querySelector('[data-role="endpoint"]');
    if (endpointInput) endpointInput.value = /^https?:/i.test(_endpoint()) ? _endpoint().replace(/\/api\/architect\/analyze$/i, '') : '';
    _panel.querySelector('[data-role="file"]').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (file.size > 12 * 1024 * 1024) return _status('La foto supera 12 MB. Elige una imagen más liviana.');
      const reader = new FileReader();
      reader.onload = function () {
        _status('Preparando ' + file.name + '…');
        _compressImage(String(reader.result || '')).then(function (compressed) {
          _selectedImage = compressed;
          _selectedName = file.name;
          const previewWrap = _panel.querySelector('[data-role="preview-wrap"]');
          const preview = _panel.querySelector('[data-role="preview"]');
          preview.src = _selectedImage;
          previewWrap.hidden = false;
          _panel.querySelector('[data-action="analyze"]').textContent = 'Analizar foto seleccionada';
          _status('Foto lista: ' + _selectedName + '. Iniciando lectura…');
          analyzeCurrentView();
        }).catch(function (error) {
          _status(error.message || 'No se pudo preparar la imagen.');
        });
      };
      reader.readAsDataURL(file);
    });
    _panel.addEventListener('click', function (event) {
      const action = event.target && event.target.dataset && event.target.dataset.action;
      if (action === 'close') deactivate();
      if (action === 'use-current') {
        _selectedImage = null;
        _selectedName = '';
        _panel.querySelector('[data-role="preview-wrap"]').hidden = true;
        _panel.querySelector('[data-action="analyze"]').textContent = 'Analizar vista 360 actual';
        _status('Se usará la vista 360 que está visible detrás de este menú.');
      }
      if (action === 'save-endpoint') saveAndTestEndpoint();
      if (action === 'analyze') analyzeCurrentView();
      if (action === 'apply') applyResult();
      if (action === 'import-extract') _mpExtract();
      if (action === 'mp-discard') _mpDiscard();
      if (action === 'mp-plano' && _mp && _mp.planoUrl) window.open(_mp.planoUrl, '_blank');
    });
    _mpBindControls();
    return _panel;
  }

  function _status(text) {
    const el = _panel && _panel.querySelector('[data-role="status"]');
    if (el) el.textContent = text || '';
  }

  async function saveAndTestEndpoint() {
    const input = _panel && _panel.querySelector('[data-role="endpoint"]');
    const value = input ? String(input.value || '').trim() : '';
    if (!/^https:\/\//i.test(value) && !/^http:\/\/localhost(?::\d+)?/i.test(value)) {
      return _status('Escribe una dirección válida, por ejemplo: https://tu-proyecto.vercel.app');
    }
    const endpoint = _normalizeEndpoint(value);
    try { localStorage.setItem('kpk_architect_vision_endpoint', endpoint); } catch (error) {}
    if (input) input.value = endpoint.replace(/\/api\/architect\/analyze$/i, '');
    _status('Comprobando la conexión con Vercel…');
    try {
      const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
      const raw = await response.text();
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch (error) {}
      if (!response.ok) throw new Error(_responseError(response.status, body, endpoint));
      if (!body.configured) {
        return _status('Vercel responde correctamente, pero falta NVIDIA_API_KEY en sus variables de entorno. Agrégala y vuelve a desplegar el proyecto.');
      }
      _status('Conexión lista. Vercel y la clave NVIDIA están configurados. Modelo: ' + (body.model || 'meta/llama-3.2-11b-vision-instruct') + (body.fallback ? ' (modelo visual compatible seleccionado automáticamente).' : '.') );
    } catch (error) {
      _status('No se pudo conectar: ' + (error.message || error));
    }
  }

  function _responseError(status, body, endpoint) {
    const detail = body && body.error ? String(body.error) : '';
    if (status === 404) return 'La función de análisis no existe en ' + endpoint + '. Despliega en Vercel la versión más reciente del proyecto.';
    if (/NVIDIA_API_KEY/i.test(detail)) return 'Falta NVIDIA_API_KEY en Vercel. Agrégala en Project Settings → Environment Variables y vuelve a desplegar.';
    if (status === 401 || status === 403) return 'NVIDIA rechazó la clave configurada en Vercel. Revisa NVIDIA_API_KEY y vuelve a desplegar.';
    return (detail || ('El servidor respondió con error ' + status)) + ' · ' + endpoint;
  }

  function _compressImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        const maxSide = 2200;
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = function () { reject(new Error('No se pudo preparar la imagen.')); };
      image.src = dataUrl;
    });
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
    if (!canvas && !_selectedImage) return _toast('La panorámica todavía no está lista.', 'error');
    const button = _panel && _panel.querySelector('[data-action="analyze"]');
    if (button) { button.disabled = true; button.textContent = 'Analizando…'; }
    _lastResult = null;
    if (_panel) _panel.querySelector('[data-action="apply"]').hidden = true;
    if (_panel) _panel.querySelector('[data-role="details"]').hidden = true;
    _status('Enviando ' + (_selectedImage ? 'la foto seleccionada' : 'la vista 360 visible') + ' al proxy seguro…');
    try {
      const endpoint = _endpoint();
      if (_needsVercelAddress()) {
        throw new Error('Esta página está abierta desde GitHub Pages. Escribe arriba la dirección completa de tu proyecto Vercel y pulsa “Guardar y probar”.');
      }
      const includeExisting = !!(_panel && _panel.querySelector('[data-role="include-existing"]:checked'));
      const image = _selectedImage || canvas.toDataURL('image/jpeg', 0.86);
      const instruction = includeExisting
        ? 'Usa las líneas visibles de la imagen y considera que las geometrías existentes pueden ser referencias, no las dupliques innecesariamente.'
        : 'Ignora cualquier dibujo superpuesto y lee únicamente la fotografía de fondo.';
      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image, instruction })
        });
      } catch (error) {
        throw new Error('No se pudo conectar con ' + endpoint + '. Comprueba la dirección y que el proyecto esté desplegado en Vercel.');
      }
      const raw = await response.text();
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch (error) {}
      if (!response.ok) throw new Error(_responseError(response.status, body, endpoint));
      if (!body.content) throw new Error('Vercel respondió, pero no entregó un análisis válido.');
      _lastResult = _normalizeResult(_parseJSON(body.content));
      const counts = _lastResult.elements.reduce((acc, item) => { acc[item.type]++; return acc; }, { street: 0, lot: 0, division: 0 });
      _status('Detectados: ' + counts.street + ' calles · ' + counts.lot + ' lotes · ' + counts.division + ' divisiones.\nRevisa el encuadre y aplica solo si la lectura coincide.');
      if (_panel) {
        const details = _panel.querySelector('[data-role="details"]');
        details.innerHTML = _lastResult.elements.map(function (item, index) {
          const label = item.label ? ' · ' + _escapeHtml(item.label) : '';
          const confidence = item.confidence == null ? '' : ' · confianza ' + Math.round(item.confidence * 100) + '%';
          return '<div style="padding:3px 0"><strong style="color:#dff8ff">' + (index + 1) + '. ' + item.type + '</strong>' + label + confidence + ' · ' + item.points.length + ' puntos</div>';
        }).join('');
        details.hidden = !_lastResult.elements.length;
      }
      if (_panel) _panel.querySelector('[data-action="apply"]').hidden = !_lastResult.elements.length;
    } catch (error) {
      _status('No se pudo analizar: ' + (error.message || error));
      _toast('La lectura IA no pudo completarse.', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = _selectedImage ? 'Analizar foto seleccionada' : 'Analizar vista 360 actual'; }
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

  // ═══ MASTERPLAN EXTERNO (scraper Krpano + ghost overlay) ═════════════
  // El navegador no puede leer tour.xml de otro dominio (sin CORS), por eso
  // la extracción se delega al endpoint seguro /api/architect/scrape
  // (Vercel Function o proxy local). El resultado se guarda en localStorage
  // y se dibuja como capa fantasma calibrable sobre el 360 propio.

  const AMP_LS_KEY = 'kpk_architect_masterplan_import';
  let _mp = null;            // { source, sceneTitle, planoUrl, lotes, hitos, offset, ghostVisible }
  let _mpLayer = null;
  let _mpMarkers = [];
  let _mpRaf = 0;
  let _mpPopup = null;
  let _mpStyleInjected = false;
  let _mpPopupBound = false;

  function _mpStatus(text) {
    const el = _panel && _panel.querySelector('[data-role="import-status"]');
    if (el) el.textContent = text || '';
  }

  function _mpSave() {
    if (!_mp) { try { localStorage.removeItem(AMP_LS_KEY); } catch (error) {} return; }
    try { localStorage.setItem(AMP_LS_KEY, JSON.stringify(_mp)); } catch (error) {}
  }

  function _mpRestore() {
    if (_mp) return;
    try {
      const raw = localStorage.getItem(AMP_LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.lotes) && data.lotes.length) {
        _mp = {
          source: data.source || '',
          sceneTitle: data.sceneTitle || '',
          planoUrl: data.planoUrl || null,
          lotes: data.lotes,
          hitos: Array.isArray(data.hitos) ? data.hitos : [],
          offset: { yaw: Number(data.offset && data.offset.yaw) || 0, pitch: Number(data.offset && data.offset.pitch) || 0 },
          ghostVisible: data.ghostVisible !== false
        };
      }
    } catch (error) {}
    if (_mp) {
      _mpShowControls();
      if (_mp.ghostVisible) _mpSetGhost(true);
    }
  }

  function _mpBase() {
    return _endpoint().replace(/\/api\/architect\/analyze$/i, '');
  }

  async function _mpExtract() {
    const input = _panel && _panel.querySelector('[data-role="import-url"]');
    const url = input ? String(input.value || '').trim() : '';
    if (!/^https?:\/\//i.test(url)) return _mpStatus('Escribe la dirección del tour Krpano, por ejemplo: https://lanube360.com/altobonito/');
    if (_needsVercelAddress()) {
      return _mpStatus('Esta página está en GitHub Pages: configura primero el servidor de análisis (caja azul de arriba) para poder extraer tours.');
    }
    const button = _panel.querySelector('[data-action="import-extract"]');
    if (button) { button.disabled = true; button.textContent = 'Extrayendo…'; }
    _mpStatus('Descargando tour.xml, fichas y geometría del masterplan…');
    try {
      const response = await fetch(_mpBase() + '/api/architect/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body && body.error ? body.error : 'El servidor respondió ' + response.status + '.');
      if (!body.lotes || !body.lotes.length) throw new Error('El tour no contiene hotspots de lotes/fichas.');
      _mp = {
        source: body.source || url,
        sceneTitle: body.scene && body.scene.title ? body.scene.title : '',
        planoUrl: body.scene && body.scene.planoUrl && body.scene.planoUrl.direct ? body.scene.planoUrl.direct : null,
        lotes: body.lotes,
        hitos: body.hitos || [],
        offset: { yaw: 0, pitch: 0 },
        ghostVisible: true
      };
      _mpSave();
      _mpShowControls();
      _mpSetGhost(true);
      const conDatos = _mp.lotes.filter(function (l) { return l.rolSII || l.superficieM2 != null; }).length;
      _mpStatus('✓ Masterplan extraído: ' + _mp.lotes.length + ' lotes · ' + _mp.hitos.length + ' hitos · ' + conDatos + ' con ficha catastral.');
    } catch (error) {
      _mpStatus('No se pudo extraer: ' + (error.message || error));
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Extraer'; }
    }
  }

  function _mpShowControls() {
    if (!_panel || !_mp) return;
    const controls = _panel.querySelector('[data-role="import-controls"]');
    const summary = _panel.querySelector('[data-role="import-summary"]');
    const yaw = _panel.querySelector('[data-role="mp-yaw"]');
    const pitch = _panel.querySelector('[data-role="mp-pitch"]');
    const ghost = _panel.querySelector('[data-role="mp-ghost"]');
    if (!controls) return;
    summary.textContent = (_mp.sceneTitle || 'Masterplan') + ' — ' + _mp.lotes.length + ' lotes · ' + _mp.hitos.length + ' hitos';
    yaw.value = String(_mp.offset.yaw);
    pitch.value = String(_mp.offset.pitch);
    _panel.querySelector('[data-role="mp-yaw-val"]').textContent = _mp.offset.yaw.toFixed(1) + '°';
    _panel.querySelector('[data-role="mp-pitch-val"]').textContent = _mp.offset.pitch.toFixed(1) + '°';
    ghost.checked = !!_mp.ghostVisible;
    controls.hidden = false;
  }

  function _mpInjectStyles() {
    if (_mpStyleInjected) return;
    _mpStyleInjected = true;
    const style = document.createElement('style');
    style.textContent = [
      '#amp-ghost-layer{position:absolute;inset:0;pointer-events:none;z-index:22;overflow:hidden}',
      '.amp-mark{position:absolute;top:0;left:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:1.5px dashed #ffcf5c;background:rgba(24,18,4,.6);color:#ffd97a;font:700 10px/23px system-ui,sans-serif;text-align:center;pointer-events:auto;cursor:pointer;will-change:transform;box-shadow:0 0 0 1px rgba(0,0,0,.4);user-select:none;-webkit-tap-highlight-color:transparent}',
      '.amp-mark--hito{border-color:#5cffe7;color:#9ffcf0;background:rgba(4,22,20,.6);font-size:9px}',
      '.amp-mark--hito::after{content:"◆"}',
      '#amp-popup{position:fixed;z-index:2147483002;width:min(300px,calc(100vw - 24px));padding:14px 16px;border:1px solid rgba(255,207,92,.45);border-radius:14px;background:linear-gradient(150deg,rgba(30,24,6,.97),rgba(14,10,2,.97));box-shadow:0 18px 60px rgba(0,0,0,.55);color:#ffedb8;font:500 12px/1.5 system-ui,sans-serif}',
      '#amp-popup h4{margin:0 0 8px;font-size:14px;color:#fff}',
      '#amp-popup .row{display:flex;justify-content:space-between;gap:12px;padding:2px 0}',
      '#amp-popup .row span:first-child{color:rgba(255,237,184,.6)}',
      '#amp-popup .coords{margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,207,92,.3);color:rgba(255,237,184,.75);font-size:11px}',
      '#amp-popup .close{position:absolute;top:8px;right:10px;border:0;background:none;color:rgba(255,237,184,.6);font-size:16px;cursor:pointer}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function _mpEnsureLayer() {
    if (_mpLayer) return _mpLayer;
    _mpInjectStyles();
    _mpLayer = document.createElement('div');
    _mpLayer.id = 'amp-ghost-layer';
    _mpLayer.setAttribute('aria-hidden', 'true');
    const host = document.getElementById('panorama-container') || document.body;
    host.appendChild(_mpLayer);
    return _mpLayer;
  }

  function _mpBuildMarkers() {
    const layer = _mpEnsureLayer();
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    _mpMarkers = [];
    if (!_mp) return;
    _mp.lotes.forEach(function (lote) {
      const el = document.createElement('div');
      el.className = 'amp-mark';
      el.textContent = lote.numero != null ? String(lote.numero) : '·';
      const marker = { el, yaw: lote.yaw, pitch: lote.pitch, data: lote, kind: 'lote', pt: [lote.pitch, lote.yaw], cam: { x: 0, y: 0, z: 0 } };
      el.addEventListener('click', function (event) {
        event.stopPropagation();
        _mpShowPopup(marker, event.clientX, event.clientY);
      });
      layer.appendChild(el);
      _mpMarkers.push(marker);
    });
    _mp.hitos.forEach(function (hito) {
      const el = document.createElement('div');
      el.className = 'amp-mark amp-mark--hito';
      const marker = { el, yaw: hito.yaw, pitch: hito.pitch, data: hito, kind: 'hito', pt: [hito.pitch, hito.yaw], cam: { x: 0, y: 0, z: 0 } };
      el.addEventListener('click', function (event) {
        event.stopPropagation();
        _mpShowPopup(marker, event.clientX, event.clientY);
      });
      layer.appendChild(el);
      _mpMarkers.push(marker);
    });
  }

  function _mpTick() {
    if (!_mp || !_mp.ghostVisible) { _mpRaf = 0; return; }
    const FCam = window.FerrariCamera;
    if (FCam && FCam.getProjectionParams && FCam.getCamFastInto) {
      const proj = FCam.getProjectionParams();
      const offY = _mp.offset.yaw;
      const offP = _mp.offset.pitch;
      for (let i = 0; i < _mpMarkers.length; i++) {
        const mk = _mpMarkers[i];
        mk.pt[0] = mk.pitch + offP;
        mk.pt[1] = mk.yaw + offY;
        const cam = FCam.getCamFastInto(mk.pt, mk.cam);
        if (cam.z <= 0.0001) {
          if (mk.el.style.display !== 'none') mk.el.style.display = 'none';
          continue;
        }
        const pp = FCam.camToPixel(cam, proj);
        if (pp.px < -40 || pp.py < -40 || pp.px > proj.w + 40 || pp.py > proj.h + 40) {
          if (mk.el.style.display !== 'none') mk.el.style.display = 'none';
          continue;
        }
        if (mk.el.style.display !== '') mk.el.style.display = '';
        mk.el.style.transform = 'translate(' + pp.px.toFixed(1) + 'px,' + pp.py.toFixed(1) + 'px)';
      }
    }
    _mpRaf = requestAnimationFrame(_mpTick);
  }

  function _mpSetGhost(visible) {
    if (!_mp) return;
    _mp.ghostVisible = !!visible;
    _mpSave();
    if (visible) {
      _mpBuildMarkers();
      if (!_mpRaf) _mpRaf = requestAnimationFrame(_mpTick);
    } else {
      if (_mpRaf) { cancelAnimationFrame(_mpRaf); _mpRaf = 0; }
      if (_mpLayer) { while (_mpLayer.firstChild) _mpLayer.removeChild(_mpLayer.firstChild); }
      _mpMarkers = [];
      _mpHidePopup();
    }
  }

  function _mpFmt(value, suffix) {
    return value == null ? '—' : String(value).replace('.', ',') + (suffix || '');
  }

  function _mpShowPopup(marker, clientX, clientY) {
    const d = marker.data || {};
    if (!_mpPopup) {
      _mpPopup = document.createElement('div');
      _mpPopup.id = 'amp-popup';
      _mpPopup.addEventListener('click', function (event) { event.stopPropagation(); });
      document.body.appendChild(_mpPopup);
    }
    const rows = [];
    if (marker.kind === 'lote') {
      if (d.estado) rows.push(['Estado', d.estado]);
      if (d.rolSII) rows.push(['Rol SII', d.rolSII]);
      if (d.superficieM2 != null) rows.push(['Superficie', _mpFmt(d.superficieM2, ' m²')]);
      if (d.servidumbreTransitoM2 != null) rows.push(['Serv. tránsito', _mpFmt(d.servidumbreTransitoM2, ' m²')]);
      if (d.anchoServTransitoM != null) rows.push(['Ancho serv. tr.', _mpFmt(d.anchoServTransitoM, ' m')]);
      if (d.servidumbreElectricaM2 != null) rows.push(['Serv. eléctrica', _mpFmt(d.servidumbreElectricaM2, ' m²')]);
      if (d.anchoServElectricaM != null) rows.push(['Ancho serv. elec.', _mpFmt(d.anchoServElectricaM, ' m')]);
    } else {
      rows.push(['Tipo', 'Hito de referencia']);
    }
    const yaw = ((marker.yaw + (_mp ? _mp.offset.yaw : 0) + 540) % 360) - 180;
    const pitch = marker.pitch + (_mp ? _mp.offset.pitch : 0);
    _mpPopup.innerHTML =
      '<button class="close" aria-label="Cerrar">×</button>' +
      '<h4>' + _escapeHtml(d.titulo || (marker.kind === 'lote' ? 'Lote ' + (d.numero || '') : 'Hito')) + '</h4>' +
      rows.map(function (row) { return '<div class="row"><span>' + _escapeHtml(row[0]) + '</span><span>' + _escapeHtml(row[1]) + '</span></div>'; }).join('') +
      '<div class="coords">P: ' + pitch.toFixed(3) + '° · Y: ' + yaw.toFixed(3) + '°<br><small style="opacity:.7">coordenada con offset aplicado — usable como referencia exacta</small></div>';
    _mpPopup.style.display = 'block';
    const rect = _mpPopup.getBoundingClientRect();
    const x = Math.min(Math.max(8, clientX + 14), window.innerWidth - rect.width - 8);
    const y = Math.min(Math.max(8, clientY - 14), window.innerHeight - rect.height - 8);
    _mpPopup.style.left = x + 'px';
    _mpPopup.style.top = y + 'px';
    _mpBindPopupClose();
  }

  function _mpHidePopup() {
    if (_mpPopup) _mpPopup.style.display = 'none';
  }

  function _mpBindPopupClose() {
    if (_mpPopupBound) return;
    _mpPopupBound = true;
    setTimeout(function () {
      document.addEventListener('pointerdown', function (event) {
        if (_mpPopup && _mpPopup.style.display === 'block' && !_mpPopup.contains(event.target)) _mpHidePopup();
      }, true);
      document.addEventListener('keydown', function (event) { if (event.key === 'Escape') _mpHidePopup(); });
    }, 0);
  }

  function _mpDiscard() {
    _mpSetGhost(false);
    _mp = null;
    _mpSave();
    const controls = _panel && _panel.querySelector('[data-role="import-controls"]');
    if (controls) controls.hidden = true;
    _mpStatus('Importación descartada.');
  }

  function _mpBindControls() {
    if (!_panel) return;
    const yaw = _panel.querySelector('[data-role="mp-yaw"]');
    const pitch = _panel.querySelector('[data-role="mp-pitch"]');
    const ghost = _panel.querySelector('[data-role="mp-ghost"]');
    if (yaw) yaw.addEventListener('input', function () {
      if (!_mp) return;
      _mp.offset.yaw = parseFloat(yaw.value) || 0;
      _panel.querySelector('[data-role="mp-yaw-val"]').textContent = _mp.offset.yaw.toFixed(1) + '°';
      _mpSave();
    });
    if (pitch) pitch.addEventListener('input', function () {
      if (!_mp) return;
      _mp.offset.pitch = parseFloat(pitch.value) || 0;
      _panel.querySelector('[data-role="mp-pitch-val"]').textContent = _mp.offset.pitch.toFixed(1) + '°';
      _mpSave();
    });
    if (ghost) ghost.addEventListener('change', function () { _mpSetGhost(ghost.checked); });
  }

  function activate() {
    if (window.FerrariTools) window.FerrariTools.deactivateAllTools();
    _active = true;
    _ensurePanel().style.display = '';
    if (_backdrop) _backdrop.style.display = '';
    _mpRestore();
    _status(_needsVercelAddress()
      ? 'Antes de analizar: pega arriba la dirección de tu proyecto Vercel y pulsa “Guardar y probar”.'
      : 'Elige una foto desde tu PC o usa la vista 360 actual.');
  }
  function deactivate() {
    _active = false;
    if (_panel) _panel.style.display = 'none';
    if (_backdrop) _backdrop.style.display = 'none';
  }
  function isActive() { return _active; }
  function bindEvents() {}

  window.FerrariArchitectVision = { activate, deactivate, isActive, bindEvents, analyzeCurrentView, applyResult, saveAndTestEndpoint };
})();
