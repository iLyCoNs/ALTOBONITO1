/*
 * Proxy local para el modo Arquitecto (visión IA + scraper de masterplans).
 * La clave NVIDIA vive únicamente en NVIDIA_API_KEY (nunca en el navegador).
 * Uso: NVIDIA_API_KEY="..." node server/architect-vision-proxy.js
 *
 * Rutas:
 *   POST /api/architect/analyze   → lectura visual IA (NVIDIA)
 *   POST /api/architect/scrape    → extrae un tour Krpano externo (JSON)
 *   GET  /api/architect/asset     → proxy de imágenes/PDF del tour fuente
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { scrapeKrpano, assertPublicHttpUrl } = require('../api/architect/krpano-lib.js');

const PORT = Number(process.env.ARCHITECT_VISION_PORT || 8787);
function readLocalEnv(name) {
  try {
    const file = path.join(__dirname, '.env');
    const text = fs.readFileSync(file, 'utf8');
    const line = text.split(/\r?\n/).find(item => item.trim().startsWith(name + '='));
    if (!line) return '';
    return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch (err) { return ''; }
}
const API_KEY = String(process.env.NVIDIA_API_KEY || readLocalEnv('NVIDIA_API_KEY') || '').trim();
const MODEL = process.env.ARCHITECT_VISION_MODEL || 'meta/muse-glimmer-30b';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MAX_BODY = 14 * 1024 * 1024;

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) {
        reject(new Error('La imagen supera el límite de 14 MB.'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch (err) { reject(new Error('JSON de solicitud inválido.')); }
    });
    req.on('error', reject);
  });
}

function normalizeImage(value) {
  if (typeof value !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(value)) {
    throw new Error('La imagen debe ser un data URI JPEG, PNG o WebP.');
  }
  return value;
}

async function analyze(payload) {
  if (!API_KEY) throw new Error('Falta NVIDIA_API_KEY en el entorno del proxy.');
  const image = normalizeImage(payload.image);
  const instruction = typeof payload.instruction === 'string' ? payload.instruction.slice(0, 6000) : '';
  const system = [
    'Eres un asistente de topografía visual para un editor de loteo.',
    'Analiza únicamente la imagen recibida; no inventes puntos ocultos.',
    'Devuelve SOLO JSON válido, sin markdown ni explicaciones.',
    'Las coordenadas son píxeles normalizados del encuadre visible: x e y entre 0 y 1.',
    'Cada polígono debe recorrer los puntos en orden y no repetir el primer punto al final.',
    'Tipos permitidos: street (eje central de calle), lot (lote), division (línea divisoria).',
    'Si un elemento no se distingue con seguridad, omítelo.'
  ].join(' ');
  const userText = [
    'Detecta las calles, los límites de lotes y las divisiones internas visibles.',
    'Para calles entrega la línea central; para lotes entrega el perímetro; para divisiones entrega una polilínea.',
    'Usa este esquema exacto:',
    '{"elements":[{"type":"street|lot|division","label":"","confidence":0,"points":[{"x":0,"y":0}]}]}',
    instruction
  ].join('\n');

  const upstream = await fetch(NVIDIA_URL, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + API_KEY,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: image } }
        ] }
      ]
    })
  });
  const json = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = json && json.error && (json.error.message || json.error.type);
    throw new Error('NVIDIA respondió ' + upstream.status + (detail ? ': ' + detail : '.'));
  }
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('La IA no devolvió un análisis.');
  return { model: MODEL, content };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    return res.end();
  }

  // ── Scraper de masterplans Krpano ────────────────────────────────
  if (req.url.split('?')[0] === '/api/architect/scrape') {
    if (req.method === 'GET') return send(res, 200, { ok: true, endpoint: 'scrape' });
    if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' });
    try {
      const body = await readJson(req);
      const url = String(body.url || '').trim();
      if (!url) return send(res, 400, { error: 'Falta la dirección del tour (campo "url").' });
      const result = await scrapeKrpano(url, 'http://localhost:' + PORT);
      return send(res, 200, result);
    } catch (err) {
      return send(res, 400, { error: err && err.message ? err.message : 'No se pudo extraer el tour.' });
    }
  }

  // ── Proxy de assets (imágenes/PDF) ───────────────────────────────
  if (req.url.split('?')[0] === '/api/architect/asset' && req.method === 'GET') {
    const params = new URL(req.url, 'http://localhost').searchParams;
    let target;
    try { target = assertPublicHttpUrl(params.get('url')); }
    catch (err) { return send(res, 400, { error: err.message }); }
    try {
      const upstream = await fetch(target.toString(), {
        headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow'
      });
      if (!upstream.ok) return send(res, 502, { error: 'El origen respondió ' + upstream.status + '.' });
      const type = String(upstream.headers.get('content-type') || '').split(';')[0].trim();
      if (!/^(image\/|application\/pdf)/i.test(type)) {
        return send(res, 415, { error: 'Tipo no permitido: ' + (type || 'desconocido') + '.' });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > 25 * 1024 * 1024) return send(res, 413, { error: 'El archivo supera 25 MB.' });
      res.writeHead(200, {
        'content-type': type,
        'cache-control': 'public, max-age=86400',
        'access-control-allow-origin': '*'
      });
      return res.end(buf);
    } catch (err) {
      return send(res, 502, { error: 'No se pudo descargar el archivo: ' + (err && err.message ? err.message : 'error de red') });
    }
  }

  if (req.method !== 'POST' || req.url !== '/api/architect/analyze') {
    return send(res, 404, { error: 'Ruta no encontrada.' });
  }
  try {
    const result = await analyze(await readJson(req));
    send(res, 200, result);
  } catch (err) {
    send(res, 400, { error: err && err.message ? err.message : 'Error de análisis.' });
  }
});

server.listen(PORT, () => {
  console.log('[Architect Vision] Proxy escuchando en http://localhost:' + PORT);
});
