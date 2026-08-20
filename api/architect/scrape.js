/* Vercel Function — scraper de masterplans Krpano para el modo Arquitecto */
'use strict';

const { scrapeKrpano } = require('./krpano-lib.js');

function json(res, status, payload) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.status(status).setHeader('cache-control', 'no-store').json(payload);
}

function proxyBase(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (!host) return null;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return proto + '://' + host;
}

module.exports = async function architectScrape(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('cache-control', 'no-store');
    return res.status(204).end();
  }
  if (req.method === 'GET') {
    return json(res, 200, { ok: true, endpoint: 'scrape', usage: 'POST { "url": "https://tour-krpano.com/proyecto/" }' });
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST');
    return json(res, 405, { error: 'Método no permitido.' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const url = String(body.url || '').trim();
    if (!url) return json(res, 400, { error: 'Falta la dirección del tour (campo "url").' });
    const result = await scrapeKrpano(url, proxyBase(req));
    return json(res, 200, result);
  } catch (error) {
    return json(res, 400, { error: error && error.message ? error.message : 'No se pudo extraer el tour.' });
  }
};
