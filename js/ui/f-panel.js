/**
 * f-panel.js — Panel de herramientas KPK + FAB + Coordinador global de tools
 *
 * REGLAS:
 * - Listeners registrados UNA SOLA VEZ en DOMContentLoaded (flag _bound)
 * - ALT+A → toggle panel (tecla global)
 * - deactivateAllTools() centralizado aquí como window.FerrariTools
 * - Lección 2: capture:false en todos los listeners de tools
 */

'use strict';

(function() {

  let _panelOpen = false;
  let _bound     = false;
  let _idleResumeTimer = null;

  // ─── REGISTRO DE HERRAMIENTAS ─────────────────────────────────────
  // Cada tool se registra aquí para poder desactivarlas todas de golpe

  const _toolRegistry = [];

  function registerTool(toolObj) {
    _toolRegistry.push(toolObj);
  }

  /**
   * Desactiva TODAS las herramientas registradas.
   * Llamado SIEMPRE antes de activar cualquier herramienta (Lección 2).
   */
  function deactivateAllTools() {
    window.currentTool = null;
    _toolRegistry.forEach(t => {
      if (typeof t.deactivate === 'function') t.deactivate();
    });
    // Limpiar estado visual de botones (excepto toggles persistentes)
    document.querySelectorAll('.kpk-tool-btn').forEach(btn => {
      if (btn.id === 'tool-geo-nearby-hide' || btn.classList.contains('kpk-tool-btn--toggle')) return;
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    });
    _syncNearbyHideBtn();
    // Resume idle solo si nadie reactive una tool en este tick
    if (_idleResumeTimer) clearTimeout(_idleResumeTimer);
    _idleResumeTimer = setTimeout(function () {
      _idleResumeTimer = null;
      if (!window.currentTool && window.FerrariIdleCam && window.FerrariIdleCam.resume) {
        window.FerrariIdleCam.resume();
      }
    }, 0);
  }

  // ─── EXPONER FerrariTools INMEDIATAMENTE ─────────────────────────
  // (otros módulos lo necesitan en su init)
  window.FerrariTools = {
    registerTool,
    deactivateAllTools
  };

  // ─── INICIALIZACIÓN ──────────────────────────────────────────────

  function init() {
    if (_bound) return;
    _bound = true;

    if (window.FerrariDrag) {
      window.FerrariDrag.attachIf('kpk-panel', { handle: '.kpk-panel-header' });
    }

    // Registrar herramientas
    registerTool(window.FerrariDrawLote);
    registerTool(window.FerrariDrawCalle);
    registerTool(window.FerrariDrawRetorno);
    registerTool(window.FerrariDrawDivision);
    registerTool(window.FerrariDrawHilera);
    registerTool(window.FerrariEraser);
    registerTool(window.FerrariEdit);
    if (window.FerrariLinkLotes) registerTool(window.FerrariLinkLotes);
    registerTool(window.FerrariAddPin);
    registerTool(window.FerrariGeoTools);
    if (window.FerrariKmzCalco) {
      registerTool(window.FerrariKmzCalco);
    }
    if (window.FerrariTone) registerTool(window.FerrariTone);
    if (window.FerrariAmenities) registerTool(window.FerrariAmenities);

    // Registrar eventos de cada tool (una sola vez)
    window.FerrariDrawLote.bindEvents();
    window.FerrariDrawCalle.bindEvents();
    window.FerrariDrawRetorno.bindEvents();
    window.FerrariDrawDivision.bindEvents();
    window.FerrariDrawHilera.bindEvents();
    window.FerrariEraser.bindEvents();
    window.FerrariEdit.bindEvents();
    if (window.FerrariLinkLotes && window.FerrariLinkLotes.bindEvents) window.FerrariLinkLotes.bindEvents();
    window.FerrariAddPin.bindEvents();
    window.FerrariGeoTools.bindEvents();
    if (window.FerrariKmzCalco && window.FerrariKmzCalco.bindEvents) {
      window.FerrariKmzCalco.bindEvents();
    }
    if (window.FerrariTone && window.FerrariTone.bindEvents) {
      window.FerrariTone.bindEvents();
    }
    if (window.FerrariAmenities && window.FerrariAmenities.bindEvents) {
      window.FerrariAmenities.bindEvents();
    }

    // ── Panel toggle ─────────────────────────────────────────────
    const close = document.getElementById('kpk-panel-close');
    close && close.addEventListener('click', togglePanel, false);

    // ── ALT+A global ─────────────────────────────────────────────
    document.addEventListener('keydown', function(e) {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        togglePanel();
      }
    }, false);

    // ── Botones de herramientas ───────────────────────────────────
    _bindToolButton('tool-lote-libre',    () => _activateTool('lote-libre'));
    _bindToolButton('tool-lote-organico', () => _activateTool('lote-organico'));
    _bindToolButton('tool-calle',         () => _activateTool('calle'));
    _bindToolButton('tool-calle-arq2',    () => _activateTool('calle-curva-arq2'));
    _bindToolButton('tool-calle-retorno', () => _activateTool('calle-retorno'));
    _bindToolButton('tool-division-curva', () => _activateTool('division-curva'));
    _bindToolButton('tool-hilera',        () => _activateTool('hilera'));
    _bindToolButton('tool-edit',          () => _activateTool('edit'));
    _bindToolButton('tool-link-lotes',    () => _activateTool('anexar-lotes'));
    _bindToolButton('tool-eraser',        () => _activateTool('eraser'));
    _bindToolButton('tool-smart-pin',     () => _activateTool('smart-pin'));
    _bindToolButton('tool-geo-north',     () => _activateTool('geo-north'));
    _bindToolButton('tool-geo-origin',    () => _activateTool('geo-origin'));
    _bindToolButton('tool-geo-horizonte', () => _activateTool('geo-horizonte'));
    _bindToolButton('tool-geo-ruta',      () => _activateTool('geo-ruta'));
    _bindToolButton('tool-geo-nearby',    () => _activateTool('geo-nearby'));
    _bindToolButton('tool-geo-amenidad',  () => _activateTool('geo-amenidad'));
    _bindToolButton('tool-tone',          () => _activateTool('tone'));

    const btnCameraFixed = document.getElementById('tool-camera-fixed');
    if (btnCameraFixed) {
      btnCameraFixed.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const api = window.FerrariIdleCam;
        if (!api || typeof api.setEditorMotionEnabled !== 'function') return;
        const enableMotion = !api.isEditorMotionEnabled();
        api.setEditorMotionEnabled(enableMotion);
        _syncCameraFixedBtn();
        if (window.FerrariUI && window.FerrariUI.showToast) {
          window.FerrariUI.showToast(
            enableMotion ? 'Recorrido cinematográfico activado' : 'Cámara fija — ya puedes dibujar con precisión',
            'info'
          );
        }
      }, false);
      // Arquitecto siempre inicia inmóvil, independientemente de otras tools.
      if (window.FerrariIdleCam && window.FerrariIdleCam.setEditorMotionEnabled) {
        window.FerrariIdleCam.setEditorMotionEnabled(false);
      }
      _syncCameraFixedBtn();
    }

    const btnNearbyHide = document.getElementById('tool-geo-nearby-hide');
    if (btnNearbyHide) {
      btnNearbyHide.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const api = window.FerrariGeoPins;
        if (!api || typeof api.setEditorNearbyHidden !== 'function') return;
        const next = !api.isEditorNearbyHidden();
        api.setEditorNearbyHidden(next);
        _syncNearbyHideBtn();
        if (window.FerrariUI && window.FerrariUI.showToast) {
          window.FerrariUI.showToast(
            next ? 'Pins Cercanos ocultos — puedes editar Horizonte' : 'Pins Cercanos visibles en la foto',
            'info'
          );
        }
      }, false);
      _syncNearbyHideBtn();
    }

    // ── Botones de acción ─────────────────────────────────────────
    const btnUndo      = document.getElementById('action-undo');
    const btnFinish    = document.getElementById('action-finish');
    const btnCancel    = document.getElementById('action-cancel');
    const btnClearAll  = document.getElementById('action-clear-all');

    btnUndo && btnUndo.addEventListener('click', function() {
      if (window.FerrariDrawLote && window.FerrariDrawLote.isActive()) {
        window.FerrariDrawLote.undoLastPoint();
        return;
      }
      if (window.FerrariOverlay.hasActiveDrawing()) {
        window.FerrariOverlay.removeLastPoint();
      }
    }, false);

    btnFinish && btnFinish.addEventListener('click', function() {
      if (window.FerrariLinkLotes && window.FerrariLinkLotes.isActive()) {
        window.FerrariLinkLotes.finish();
        return;
      }
      const pts = window.FerrariOverlay.getActivePoints();
      if (pts.length < 2) {
        window.FerrariUI && window.FerrariUI.showToast('Se necesitan al menos 2 vértices.', 'error');
        return;
      }
      // Delegar al tool activo
      _dispatchFinish();
    }, false);

    btnCancel && btnCancel.addEventListener('click', function() {
      if (window.FerrariDrawLote && window.FerrariDrawLote.isActive()) {
        window.FerrariDrawLote.cancelDrawing();
        return;
      }
      window.FerrariOverlay.clearOverlay();
      window.FerrariOverlay.startDrawing([]);
      window.FerrariHUD && window.FerrariHUD.hideDraw();
      window.FerrariUI  && window.FerrariUI.showToast('Dibujo cancelado.', 'info');
    }, false);

    btnClearAll && btnClearAll.addEventListener('click', function() {
      if (!confirm('¿Borrar TODOS los elementos dibujados? Esta acción no se puede deshacer.')) return;
      deactivateAllTools();
      window.FerrariOverlay.clearOverlay();
      window.FerrariState.clearAll();
      window.FerrariUI && window.FerrariUI.showToast('Todo borrado.', 'success');
    }, false);

    console.log('[Ferrari/Panel] ✓ Panel inicializado, ALT+A activo');
  }

  // ─── TOGGLE PANEL ────────────────────────────────────────────────

  function togglePanel() {
    _panelOpen = !_panelOpen;

    const panel = document.getElementById('kpk-panel');
    const fab   = document.getElementById('kpk-fab');

    if (panel) panel.classList.toggle('kpk-panel--open', _panelOpen);
    if (fab)   fab.classList.toggle('hidden', _panelOpen);
    document.body.classList.toggle('f-tool-mode', _panelOpen);

    try {
      document.dispatchEvent(new CustomEvent('ferrari:panel-toggle', { detail: { open: _panelOpen } }));
    } catch (e) {}

    if (window.FerrariBuyerDock && window.FerrariBuyerDock.refresh) {
      window.FerrariBuyerDock.refresh();
    }
    if (window.FerrariGeoPins && window.FerrariGeoPins.rebuild) {
      window.FerrariGeoPins.rebuild();
    }
    _syncNearbyHideBtn();
  }

  function openPanel()  { if (!_panelOpen)  togglePanel(); }
  function closePanel() { if (_panelOpen)   togglePanel(); }
  function isOpen() { return _panelOpen; }
  function isToolMode() {
    const panel = document.getElementById('kpk-panel');
    return !!(panel && panel.classList.contains('kpk-panel--open'));
  }

  // ─── ACTIVACIÓN DE HERRAMIENTAS ──────────────────────────────────

  function _activateTool(tipo) {
    if (_idleResumeTimer) {
      clearTimeout(_idleResumeTimer);
      _idleResumeTimer = null;
    }
    if (window.FerrariIdleCam && typeof window.FerrariIdleCam.pause === 'function') {
      // Tone es panel de look: no necesita pausar idle
      if (tipo !== 'tone') window.FerrariIdleCam.pause();
    }
    switch(tipo) {
      case 'lote-libre':
      case 'lote-organico':
        window.FerrariDrawLote.activate(tipo);
        break;
      case 'calle':
      case 'calle-curva-arq2':
        window.FerrariDrawCalle.activate(tipo);
        break;
      case 'calle-retorno':
        window.FerrariDrawRetorno.activate();
        break;
      case 'division-curva':
        window.FerrariDrawDivision.activate();
        break;
      case 'hilera':
        window.FerrariDrawHilera.activate();
        break;
      case 'edit':
        window.FerrariEdit.activate();
        break;
      case 'anexar-lotes':
        window.FerrariLinkLotes.activate();
        break;
      case 'eraser':
        window.FerrariEraser.activate();
        break;
      case 'smart-pin':
        window.FerrariAddPin.activate();
        break;
      case 'geo-north':
        window.FerrariGeoTools.activate('north');
        break;
      case 'geo-origin':
        window.FerrariGeoTools.openOriginDialog();
        // No deja tool activo (es un diálogo)
        document.querySelectorAll('.kpk-tool-btn').forEach(btn => {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        });
        if (window.FerrariIdleCam) window.FerrariIdleCam.resume();
        return;
      case 'geo-horizonte':
        window.FerrariGeoTools.activate('horizonte');
        break;
      case 'geo-ruta':
        window.FerrariGeoTools.activate('ruta');
        break;
      case 'geo-amenidad':
        if (window.FerrariAmenities) window.FerrariAmenities.activate();
        break;
      case 'tone':
        if (window.FerrariTone) window.FerrariTone.activate();
        break;
      case 'geo-nearby':
        if (window.FerrariGeoTools.openNearbyDialog) {
          window.FerrariGeoTools.openNearbyDialog();
        } else {
          window.FerrariGeoTools.fetchNearby(8000);
        }
        document.querySelectorAll('.kpk-tool-btn').forEach(btn => {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        });
        if (window.FerrariIdleCam) window.FerrariIdleCam.resume();
        return;
    }

    // Marcar botón activo DESPUÉS de activar, ya que las herramientas pueden llamar a deactivateAllTools internamente
    document.querySelectorAll('.kpk-tool-btn').forEach(btn => {
      if (btn.id === 'tool-geo-nearby-hide' || btn.classList.contains('kpk-tool-btn--toggle')) return;
      const isCurrent = btn.dataset.tool === tipo;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
    });
    _syncNearbyHideBtn();
  }

  function _syncNearbyHideBtn() {
    const btn = document.getElementById('tool-geo-nearby-hide');
    const label = document.getElementById('tool-geo-nearby-hide-label');
    if (!btn) return;
    const hidden = !!(window.FerrariGeoPins && typeof window.FerrariGeoPins.isEditorNearbyHidden === 'function'
      && window.FerrariGeoPins.isEditorNearbyHidden());
    btn.classList.toggle('active', hidden);
    btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    if (label) label.textContent = hidden ? 'Mostrar cercanos' : 'Ocultar cercanos';
    btn.title = hidden
      ? 'Mostrar pins Cercanos en la foto'
      : 'Ocultar pins Cercanos mientras editas Horizonte';
  }

  function _syncCameraFixedBtn() {
    const btn = document.getElementById('tool-camera-fixed');
    const label = document.getElementById('tool-camera-fixed-label');
    const icon = document.getElementById('tool-camera-fixed-icon');
    if (!btn) return;
    const motionEnabled = !!(window.FerrariIdleCam
      && typeof window.FerrariIdleCam.isEditorMotionEnabled === 'function'
      && window.FerrariIdleCam.isEditorMotionEnabled());
    const fixed = !motionEnabled;
    btn.classList.toggle('active', fixed);
    btn.setAttribute('aria-pressed', fixed ? 'true' : 'false');
    btn.title = fixed
      ? 'Cámara fija: impide que el panorama se mueva solo'
      : 'Recorrido activo: pulsa para inmovilizar la cámara';
    if (label) label.textContent = fixed ? 'Cámara fija' : 'Recorrido cine';
    if (icon) {
      icon.innerHTML = fixed
        ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'
        : '<path d="M8 5v14l11-7z"/>';
    }
  }

  function _bindToolButton(id, handler) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function() {
      // Si ya está activo este tool, desactivar (toggle)
      const isCurrent = btn.classList.contains('active');
      if (isCurrent) {
        deactivateAllTools();
        window.FerrariHUD && window.FerrariHUD.hideDraw();
      } else {
        handler();
      }
    }, false);
  }

  /**
   * Delega el "finalizar" al tool activo actualmente.
   */
  function _dispatchFinish() {
    if (window.FerrariDrawLote.isActive()) {
      // Simular Enter
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else if (window.FerrariDrawCalle.isActive()) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else if (window.FerrariDrawDivision.isActive()) {
      window.FerrariDrawDivision.finish();
    } else if (window.FerrariLinkLotes && window.FerrariLinkLotes.isActive()) {
      window.FerrariLinkLotes.finish();
    }
  }

  // ─── ARRANQUE ────────────────────────────────────────────────────
  // Usamos 'load' en lugar de 'DOMContentLoaded' para garantizar que
  // los módulos de tools (que vienen DESPUÉS en el HTML) ya estén cargados.
  // En modo viewer: no se registran herramientas ni eventos de panel.
  if (window.FERRARI_MODE === 'viewer') {
    console.log('[Ferrari/Panel] Modo viewer: panel de herramientas desactivado');
  } else {
    window.addEventListener('load', init, { once: true });
  }

  // ─── API PÚBLICA ─────────────────────────────────────────────────
  window.FerrariPanel = { togglePanel, openPanel, closePanel, isOpen, isToolMode };

  console.log('[Ferrari/Panel] ✓ Módulo cargado');

})();
