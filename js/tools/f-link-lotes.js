/**
 * f-link-lotes.js — Une fragmentos físicos que comercialmente son un mismo lote.
 * Útil cuando una calle atraviesa el lote y obliga a dibujarlo con dos polígonos.
 */
'use strict';

(function () {
  let _active = false;
  let _bound = false;
  const _selected = new Set();

  function activate() {
    window.FerrariTools.deactivateAllTools();
    _active = true;
    window.currentTool = 'anexar-lotes';
    document.body.classList.add('link-lotes-active');
    window.FerrariHUD && window.FerrariHUD.showDraw('anexar-lotes');
    window.FerrariUI && window.FerrariUI.showToast(
      'Anexar partes: selecciona los polígonos del mismo lote y pulsa Enter.',
      'info'
    );
  }

  function deactivate() {
    if (!_active) return;
    _active = false;
    document.body.classList.remove('link-lotes-active');
    _clearSelection();
    window.FerrariHUD && window.FerrariHUD.hideDraw();
  }

  function isActive() { return _active; }

  function bindEvents() {
    if (_bound) return;
    _bound = true;
    const svg = document.getElementById('loteo-svg');
    if (svg) svg.addEventListener('click', _onClick, false);
    document.addEventListener('keydown', _onKeyDown, false);
  }

  function _onClick(e) {
    if (!_active) return;
    const group = e.target && e.target.closest ? e.target.closest('g.lote-interactivo[data-id]') : null;
    if (!group) return;
    e.preventDefault();
    e.stopPropagation();
    const id = group.getAttribute('data-id');
    const line = window.FerrariState.getLine(id);
    if (!line || !_isLote(line)) return;

    if (_selected.has(id)) {
      _selected.delete(id);
      group.classList.remove('is-link-selected');
    } else {
      _selected.add(id);
      group.classList.add('is-link-selected');
    }
    window.FerrariHUD && window.FerrariHUD.updateDraw('anexar-lotes', _selected.size);
  }

  function _onKeyDown(e) {
    if (!_active) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      finish();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      _clearSelection();
    }
  }

  function finish() {
    if (!_active) return;
    if (_selected.size < 2) {
      window.FerrariUI && window.FerrariUI.showToast('Selecciona al menos dos partes del mismo lote.', 'info');
      return;
    }

    const lines = window.allDrawnLines || [];
    const selectedLines = lines.filter(line => _selected.has(line.id));
    const oldGroups = new Set(selectedLines.map(line => line.loteGrupoId).filter(Boolean));
    const groupId = 'lote-grupo-' + window.FerrariState.generateId();
    const next = lines.map(line => {
      if (_selected.has(line.id) || (line.loteGrupoId && oldGroups.has(line.loteGrupoId))) {
        return Object.assign({}, line, { loteGrupoId: groupId });
      }
      return line;
    });

    window.FerrariState.replaceAll(next);
    window.FerrariCamera && window.FerrariCamera.markDirty();
    window.FerrariRAF && window.FerrariRAF.markDataDirty && window.FerrariRAF.markDataDirty();
    window.FerrariSVGPaths && window.FerrariSVGPaths.setHoveredLote && window.FerrariSVGPaths.setHoveredLote(null);
    _clearSelection();
    window.FerrariUI && window.FerrariUI.showToast(
      'Partes anexadas: ahora se iluminan y se administran como un mismo lote.',
      'success'
    );
  }

  function _clearSelection() {
    _selected.forEach(id => {
      const entry = window.DOMCache && window.DOMCache.paths && window.DOMCache.paths.get(id);
      if (entry && entry.gNode) entry.gNode.classList.remove('is-link-selected');
    });
    _selected.clear();
    window.FerrariHUD && window.FerrariHUD.updateDraw('anexar-lotes', 0);
  }

  function _isLote(line) {
    return line && (line.tipo === 'lote-libre' || line.tipo === 'lote-organico' || line.tipo === 'franja-grupo');
  }

  window.FerrariLinkLotes = { activate, deactivate, isActive, bindEvents, finish };
  console.log('[Ferrari/AnexarLotes] ✓ Módulo inicializado');
})();
