/*
 * Proxy local para la lectura visual del modo Arquitecto.
 * La clave NVIDIA vive únicamente en NVIDIA_API_KEY (nunca en el navegador).
 * Uso: NVIDIA_API_KEY="..." node server/architect-vision-proxy.js
 */
'use strict';

const http = require('http');

const PORT = Number(process.env.ARCHITECT_VISION_PORT || 8787);
const API_KEY = String(process.env.NVIDIA_API_KEY || '').trim();
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
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    return res.end();
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
