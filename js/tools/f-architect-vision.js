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
    });
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

  function activate() {
    if (window.FerrariTools) window.FerrariTools.deactivateAllTools();
    _active = true;
    _ensurePanel().style.display = '';
    if (_backdrop) _backdrop.style.display = '';
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
