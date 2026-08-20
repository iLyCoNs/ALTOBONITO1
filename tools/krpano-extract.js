/**
 * krpano-extract.js — Descarga un masterplan Krpano al repositorio local.
 *
 * Uso:
 *   node tools/krpano-extract.js https://lanube360.com/altobonito/
 *
 * Usa el mismo parser que el modo Arquitecto (api/architect/krpano-lib.js)
 * y además baja los assets a disco:
 *   - data/masterplan-2024.json     (geometría + fichas catastrales)
 *   - assets/masterplan-2024/       (cubemap, preview, thumb, plano.pdf, fotos)
 *
 * El flujo equivalente desde el navegador es el panel Arquitecto →
 * "Importar masterplan externo (Krpano)" (endpoint /api/architect/scrape).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { scrapeKrpano } = require('../api/architect/krpano-lib.js');

const ROOT = path.join(__dirname, '..');
const OUT_ASSETS = path.join(ROOT, 'assets', 'masterplan-2024');
const OUT_JSON = path.join(ROOT, 'data', 'masterplan-2024.json');

async function fetchBin(url, destFile) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' },
    signal: AbortSignal.timeout(30000),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.writeFileSync(destFile, buf);
  return { bytes: buf.length, file: path.relative(ROOT, destFile) };
}

async function main() {
  const base = String(process.argv[2] || 'https://lanube360.com/altobonito/').replace(/\/+$/, '');
  console.log(`[krpano-extract] Tour: ${base}`);
  fs.mkdirSync(OUT_ASSETS, { recursive: true });

  const result = await scrapeKrpano(base, null);
  const sourceBase = result.source.replace(/[^/]*$/, '');
  console.log(`[krpano-extract] ${result.counts.lotes} lotes · ${result.counts.hitos} hitos · ${result.counts.fichasConDatos} fichas`);

  // ── Descargar assets ────────────────────────────────────────────────
  const downloads = [];
  const faces = {};
  for (const f of ['l', 'f', 'r', 'b', 'u', 'd']) {
    const face = result.scene.cube.faces[f];
    if (face) {
      downloads.push([face.direct, path.join(OUT_ASSETS, `pano_${f}.jpg`)]);
      faces[f] = `assets/masterplan-2024/pano_${f}.jpg`;
    }
  }
  if (result.scene.previewUrl) downloads.push([result.scene.previewUrl.direct, path.join(OUT_ASSETS, 'preview.jpg')]);
  if (result.scene.thumbUrl) downloads.push([result.scene.thumbUrl.direct, path.join(OUT_ASSETS, 'thumb.jpg')]);
  if (result.scene.planoUrl) downloads.push([result.scene.planoUrl.direct, path.join(OUT_ASSETS, 'plano.pdf')]);

  // Fotos de galería de lotes (ruta típica de skins Krpano)
  const fotoRefs = [...new Set(result.lotes.map(l => l.fotoRef).filter(Boolean))];
  for (const ref of fotoRefs) {
    downloads.push([`${sourceBase}skin/img-lotes/${ref}.jpg`, path.join(OUT_ASSETS, 'img-lotes', `${ref}.jpg`)]);
  }

  const downloaded = [];
  const fallidas = [];
  for (const [url, dest] of downloads) {
    try {
      const r = await fetchBin(url, dest);
      downloaded.push(r);
      console.log(`[krpano-extract] ✓ ${r.file} (${(r.bytes / 1024).toFixed(0)} KB)`);
    } catch (e) {
      fallidas.push(url);
      console.log(`[krpano-extract] ✗ ${url} — ${e.message}`);
    }
  }

  // ── masterplan-2024.json (formato local) ────────────────────────────
  const fotoLocal = {};
  fotoRefs.forEach(ref => { fotoLocal[ref] = `assets/masterplan-2024/img-lotes/${ref}.jpg`; });

  const out = {
    version: 1,
    source: sourceBase,
    extractedAt: result.extractedAt,
    scene: {
      name: result.scene.name,
      title: result.scene.title,
      initialView: result.scene.initialView,
      cube: { faceSize: 2048, faces },
      preview: result.scene.previewUrl ? 'assets/masterplan-2024/preview.jpg' : null,
      thumb: result.scene.thumbUrl ? 'assets/masterplan-2024/thumb.jpg' : null,
      planoPdf: result.scene.planoUrl ? 'assets/masterplan-2024/plano.pdf' : null
    },
    hitos: result.hitos,
    lotes: result.lotes.map(l => {
      const { fotoRef, ...rest } = l;
      return { ...rest, foto: fotoRef ? (fotoLocal[fotoRef] || null) : null };
    }),
    calibracion: null
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2), 'utf8');
  console.log(`[krpano-extract] ✓ ${path.relative(ROOT, OUT_JSON)} — ${out.lotes.length} lotes · ${out.hitos.length} hitos · ${downloaded.length} assets`);
  if (fallidas.length) console.log(`[krpano-extract] ⚠ ${fallidas.length} descargas fallidas (revisar arriba)`);
}

main().catch(err => {
  console.error('[krpano-extract] ERROR:', err.message);
  process.exit(1);
});
