/**
 * krpano-lib.js — Parser/scraper de tours Krpano para el modo Arquitecto.
 *
 * Compartido entre:
 *   - api/architect/scrape.js   (Vercel Function)
 *   - server/architect-vision-proxy.js (proxy local de desarrollo)
 *
 * Dado un tour Krpano (URL raíz o directa a tour.xml):
 *   1. Descarga tour.xml (y los <include> de skin, con anidación 1 nivel).
 *   2. Extrae la primera escena: título, vista inicial, cubemap, preview, thumb.
 *   3. Clasifica hotspots: lotes (fichas con datos catastrales) vs hitos.
 *   4. Parsea las fichas <data> (estado, rol SII, superficie, servidumbres).
 *   5. Detecta el plano PDF referenciado en openurl(...) de los skins.
 *
 * Convención Krpano → Pannellum: ath ≡ yaw, atv ≡ pitch (+derecha/+arriba).
 * La calibración entre vuelos distintos (offset global) se ajusta en el
 * navegador; aquí solo se entregan coordenadas esféricas crudas del tour fuente.
 */

'use strict';

const KRPA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_XML_BYTES = 2 * 1024 * 1024;   // tour.xml + data.xml
const MAX_SKIN_BYTES = 768 * 1024;       // includes de skin
const MAX_INCLUDES = 6;
const FETCH_TIMEOUT_MS = 12000;

// ─── Seguridad básica anti-SSRF ─────────────────────────────────────────

function assertPublicHttpUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch (e) {
    throw new Error('La dirección no es una URL válida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Solo se aceptan direcciones http:// o https://.');
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '0.0.0.0' || host === 'metadata.google.internal';
  if (blocked) throw new Error('No se permiten direcciones de red interna.');
  return url;
}

// ─── Fetch con límites ──────────────────────────────────────────────────

async function fetchText(url, maxBytes) {
  const res = await fetch(url, {
    headers: { 'user-agent': KRPA_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error(`El archivo supera el límite de ${Math.round(maxBytes / 1024)} KB.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`El archivo supera el límite de ${Math.round(maxBytes / 1024)} KB.`);
  return buf.toString('utf8');
}

// ─── Parsing ────────────────────────────────────────────────────────────

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
  return m ? m[1] : null;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/** "7.200,02" → 7200.02 · "15 mts." → 15 */
function numCL(text) {
  const m = String(text || '').replace(/\s/g, '').match(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
}

function parseFicha(html) {
  const text = decodeEntities(html);
  const tituloM = html.match(/<h2>([^<]+)<\/h2>/i);
  const grab = (label) => {
    const m = text.match(new RegExp(label + ':\\s*([^\\n]+)', 'i'));
    return m ? m[1].trim() : null;
  };
  return {
    titulo: tituloM ? decodeEntities(tituloM[1]) : null,
    estado: grab('Estado'),
    rolSII: (grab('Pre rol SII') || grab('Rol SII') || '').replace(/\s+/g, ' ') || null,
    superficieM2: numCL(grab('Superficie')),
    servidumbreTransitoM2: numCL(grab('Servidumbre Transito')),
    anchoServTransitoM: numCL(grab('Ancho Serv. Transito')),
    servidumbreElectricaM2: numCL(grab('Servidumbre Electrica')),
    anchoServElectricaM: numCL(grab('Ancho Serv. Electrica'))
  };
}

function resolveUrl(relative, base) {
  try { return new URL(relative, base).toString(); } catch (e) { return null; }
}

/** Extrae la primera escena <scene>…</scene> del tour.xml */
function parseScene(tourXml, baseUrl) {
  const sceneOpen = tourXml.match(/<scene\b[^>]*>/);
  if (!sceneOpen) return null;
  const sceneTag = sceneOpen[0];
  const rest = tourXml.slice(sceneOpen.index);
  const sceneClose = rest.indexOf('</scene>');
  const block = sceneClose >= 0 ? rest.slice(0, sceneClose) : rest.slice(0, 20000);

  const view = block.match(/<view\b[^>]*\/?>/);
  const viewTag = view ? view[0] : '';

  const cube = block.match(/<cube\b[^>]*url="([^"]+)"/);
  const mobileCube = block.match(/<mobile>[\s\S]*?<cube\b[^>]*url="([^"]+)"/);
  const preview = block.match(/<preview\b[^>]*url="([^"]+)"/);
  const thumb = sceneTag.match(/thumburl="([^"]+)"/);

  return {
    name: attr(sceneTag, 'name') || null,
    title: decodeEntities(attr(sceneTag, 'title') || ''),
    initialView: {
      hlookat: Number(attr(viewTag, 'hlookat')) || 0,
      vlookat: Number(attr(viewTag, 'vlookat')) || 0,
      fov: Number(attr(viewTag, 'fov')) || 100
    },
    cubeUrl: cube ? resolveUrl(cube[1], baseUrl) : null,
    mobileCubeUrl: mobileCube ? resolveUrl(mobileCube[1], baseUrl) : null,
    previewUrl: preview ? resolveUrl(preview[1], baseUrl) : null,
    thumbUrl: thumb ? resolveUrl(thumb[1], baseUrl) : null,
    hotspots: parseHotspots(block)
  };
}

function parseHotspots(blockXml) {
  const out = [];
  const re = /<hotspot\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(blockXml))) {
    const tag = m[0];
    const ath = parseFloat(attr(tag, 'ath'));
    const atv = parseFloat(attr(tag, 'atv'));
    if (!Number.isFinite(ath) || !Number.isFinite(atv)) continue;
    out.push({
      name: attr(tag, 'name') || '',
      url: attr(tag, 'url') || '',
      onclick: attr(tag, 'onclick') || '',
      yaw: ath,
      pitch: atv
    });
  }
  return out;
}

/** Clasifica: hotspots de ficha/lote vs hitos de referencia. */
function isFichaHotspot(h) {
  return /^ficha/i.test(h.name) || /mostrar_ficha/i.test(h.onclick) || /ficha/i.test(h.onclick);
}

// ─── Scraper principal ──────────────────────────────────────────────────

/**
 * @param {string} inputUrl  URL raíz del tour o directa al tour.xml
 * @param {string|null} proxyBase  Base propia para construir URLs de proxy
 *                                 (p.ej. "https://x.vercel.app"). Si es null
 *                                 solo se devuelven las URLs directas.
 * @returns {Promise<object>} resultado estructurado del masterplan
 */
async function scrapeKrpano(inputUrl, proxyBase) {
  assertPublicHttpUrl(inputUrl);

  // Normalizar entrada → URL de tour.xml
  let tourUrl = String(inputUrl).trim().replace(/\/+$/, '');
  if (/\/tour\.xml$/i.test(tourUrl)) {
    // directo
  } else if (/\.(xml|html?|js|swf)$/i.test(tourUrl)) {
    throw new Error('Apunta a la carpeta del tour (ej: https://sitio.com/proyecto/) o directamente a su tour.xml.');
  } else {
    tourUrl += '/tour.xml';
  }
  assertPublicHttpUrl(tourUrl);

  const baseUrl = tourUrl.replace(/[^/]*$/, '');
  const tourXml = await fetchText(tourUrl, MAX_XML_BYTES);

  const scene = parseScene(tourXml, baseUrl);
  if (!scene) throw new Error('El tour.xml no contiene escenas (¿es un tour Krpano?).');

  // ── Includes de skin (para encontrar data.xml y el plano PDF) ──
  const includeUrls = [];
  const reInc = /<include\b[^>]*url="([^"]+)"/g;
  let m;
  while ((m = reInc.exec(tourXml))) {
    const abs = resolveUrl(m[1], baseUrl);
    if (abs && !/googleanalytics/i.test(abs)) includeUrls.push(abs);
  }

  let dataXml = '';
  const planoCandidates = [];
  const nestedIncludes = [];
  for (const incUrl of includeUrls.slice(0, MAX_INCLUDES)) {
    let content;
    try { content = await fetchText(incUrl, MAX_SKIN_BYTES); }
    catch (e) { continue; }
    // plano.pdf referenciado en acciones openurl(...) — con o sin comillas:
    // openurl(skin/plano.pdf,_blank) y openurl('skin/plano.pdf',_blank)
    // Krpano resuelve openurl contra la RAÍZ del tour; probamos también
    // contra el directorio del include por si el tour usa rutas locales.
    const reOpen = /openurl\(\s*['"]?([^'"),\s]+)['"]?/gi;
    while ((m = reOpen.exec(content))) {
      const rel = m[1];
      if (!/\.(pdf|png|jpe?g)$/i.test(rel)) continue;
      const fromBase = resolveUrl(rel, baseUrl);
      const fromInc = resolveUrl(rel, incUrl);
      if (fromBase && !planoCandidates.includes(fromBase)) planoCandidates.push(fromBase);
      if (fromInc && fromInc !== fromBase && !planoCandidates.includes(fromInc)) planoCandidates.push(fromInc);
    }
    // includes anidados (ej: skin/ficha.xml → data.xml)
    const reNested = /<include\b[^>]*url="([^"]+)"/g;
    while ((m = reNested.exec(content))) {
      const abs = resolveUrl(m[1], incUrl);
      if (abs && !/googleanalytics/i.test(abs)) nestedIncludes.push(abs);
    }
    // fichas embebidas directamente en el include
    if (/<data\s+name=/i.test(content)) dataXml += '\n' + content;
  }
  for (const incUrl of nestedIncludes.slice(0, MAX_INCLUDES)) {
    try { dataXml += '\n' + await fetchText(incUrl, MAX_XML_BYTES); }
    catch (e) { continue; }
  }
  if (/<data\s+name=/i.test(tourXml)) dataXml += '\n' + tourXml;

  // ── Fichas catastrales ──
  const fichas = {};
  const reData = /<data\s+name="([^"]+)">([\s\S]*?)<\/data>/g;
  while ((m = reData.exec(dataXml))) fichas[m[1]] = parseFicha(m[2]);

  // ── Lotes + hitos ──
  const fotoDe = {};
  const lotes = [];
  const hitos = [];
  for (const h of scene.hotspots) {
    if (isFichaHotspot(h)) {
      const fm = (h.onclick.match(/mostrar_ficha\(\s*[^,]+,\s*(\w+)\s*\)/) || [])[1];
      if (fm) fotoDe[h.name] = fm;
      const numMatch = h.name.match(/(\d+)/);
      const ficha = fichas[h.name] || {};
      lotes.push({
        id: h.name,
        numero: numMatch ? parseInt(numMatch[1], 10) : null,
        yaw: h.yaw,
        pitch: h.pitch,
        // Referencia de foto de galería (arg de mostrar_ficha). La resolución
        // de ruta es específica de cada skin → la resuelve el consumidor.
        fotoRef: fotoDe[h.name] || null,
        titulo: ficha.titulo || null,
        estado: ficha.estado || null,
        rolSII: ficha.rolSII || null,
        superficieM2: ficha.superficieM2 != null ? ficha.superficieM2 : null,
        servidumbreTransitoM2: ficha.servidumbreTransitoM2 != null ? ficha.servidumbreTransitoM2 : null,
        anchoServTransitoM: ficha.anchoServTransitoM != null ? ficha.anchoServTransitoM : null,
        servidumbreElectricaM2: ficha.servidumbreElectricaM2 != null ? ficha.servidumbreElectricaM2 : null,
        anchoServElectricaM: ficha.anchoServElectricaM != null ? ficha.anchoServElectricaM : null
      });
    } else {
      hitos.push({ id: h.name, yaw: h.yaw, pitch: h.pitch, icono: h.url || null });
    }
  }
  lotes.sort((a, b) => (a.numero || 0) - (b.numero || 0));

  // ── Plano: verificar qué candidato existe realmente (HEAD) ──
  let planoUrl = null;
  for (const cand of planoCandidates.slice(0, 4)) {
    try {
      const head = await fetch(cand, {
        method: 'HEAD',
        headers: { 'user-agent': KRPA_UA },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
      });
      if (head.ok) { planoUrl = cand; break; }
    } catch (e) { continue; }
  }

  // ── URLs de assets ──
  const proxied = (abs) => {
    if (!abs || !proxyBase) return abs;
    return String(proxyBase).replace(/\/+$/, '') + '/api/architect/asset?url=' + encodeURIComponent(abs);
  };

  const cubePattern = scene.cubeUrl; // panos/X.tiles/pano_%s.jpg
  const faces = {};
  if (cubePattern) {
    for (const f of ['l', 'f', 'r', 'b', 'u', 'd']) {
      const abs = cubePattern.replace('%s', f);
      faces[f] = { direct: abs, proxied: proxied(abs) };
    }
  }

  return {
    ok: true,
    source: tourUrl,
    extractedAt: new Date().toISOString(),
    scene: {
      name: scene.name,
      title: scene.title,
      initialView: scene.initialView,
      cube: { facePattern: cubePattern, faces },
      previewUrl: scene.previewUrl ? { direct: scene.previewUrl, proxied: proxied(scene.previewUrl) } : null,
      thumbUrl: scene.thumbUrl ? { direct: scene.thumbUrl, proxied: proxied(scene.thumbUrl) } : null,
      planoUrl: planoUrl ? { direct: planoUrl, proxied: proxied(planoUrl) } : null
    },
    hitos,
    lotes,
    counts: { lotes: lotes.length, hitos: hitos.length, fichasConDatos: Object.keys(fichas).length }
  };
}

module.exports = { scrapeKrpano, assertPublicHttpUrl, fetchText };
