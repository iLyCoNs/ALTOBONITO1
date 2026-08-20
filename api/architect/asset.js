/* Vercel Function — proxy de assets (imágenes/PDF) de tours externos.
 * Permite al navegador componer en canvas imágenes sin CORS del tour fuente.
 * GET /api/architect/asset?url=https://...jpg
 */
'use strict';

const { assertPublicHttpUrl } = require('./krpano-lib.js');

const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;
const ALLOWED_TYPES = /^(image\/|application\/pdf)/i;

function json(res, status, payload) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.status(status).setHeader('cache-control', 'no-store').json(payload);
}

module.exports = async function architectAsset(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'Método no permitido.' });
  }
  const raw = req.query && req.query.url;
  let target;
  try { target = assertPublicHttpUrl(raw); }
  catch (error) { return json(res, 400, { error: error.message }); }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow'
    });
    if (!upstream.ok || !upstream.body) {
      return json(res, 502, { error: 'El origen respondió ' + upstream.status + '.' });
    }
    const type = String(upstream.headers.get('content-type') || '').split(';')[0].trim();
    if (!ALLOWED_TYPES.test(type)) {
      return json(res, 415, { error: 'Tipo no permitido: ' + (type || 'desconocido') + '.' });
    }
    const len = Number(upstream.headers.get('content-length') || 0);
    if (len > MAX_ASSET_BYTES) {
      return json(res, 413, { error: 'El archivo supera 25 MB.' });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_ASSET_BYTES) {
      return json(res, 413, { error: 'El archivo supera 25 MB.' });
    }
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'public, max-age=86400');
    res.setHeader('content-type', type);
    return res.status(200).end(buf);
  } catch (error) {
    return json(res, 502, { error: 'No se pudo descargar el archivo: ' + (error && error.message ? error.message : 'error de red') });
  }
};
