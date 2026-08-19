/* Vercel Function — análisis visual del modo Arquitecto */
'use strict';

const MAX_BODY = 14 * 1024 * 1024;
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

function json(res, status, payload) {
  res.status(status).setHeader('cache-control', 'no-store').json(payload);
}

function imageDataUri(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_BODY ||
      !/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(value)) {
    throw new Error('La imagen debe ser un data URI JPEG, PNG o WebP de máximo 14 MB.');
  }
  return value;
}

function prompt(instruction) {
  return [
    'Eres un asistente de topografía visual para un editor de loteo.',
    'Analiza únicamente la imagen recibida; no inventes puntos ocultos.',
    'Devuelve SOLO JSON válido, sin markdown ni explicaciones.',
    'Las coordenadas son píxeles normalizados del encuadre visible: x e y entre 0 y 1.',
    'Cada polígono debe recorrer los puntos en orden y no repetir el primer punto al final.',
    'Tipos permitidos: street (eje central de calle), lot (lote), division (línea divisoria).',
    'Si un elemento no se distingue con seguridad, omítelo.',
    'Detecta las calles, los límites de lotes y las divisiones internas visibles.',
    'Para calles entrega la línea central; para lotes entrega el perímetro; para divisiones entrega una polilínea.',
    'Usa este esquema exacto:',
    '{"elements":[{"type":"street|lot|division","label":"","confidence":0,"points":[{"x":0,"y":0}]}]}',
    typeof instruction === 'string' ? instruction.slice(0, 6000) : ''
  ].join('\n');
}

module.exports = async function architectVision(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return json(res, 405, { error: 'Método no permitido.' });
  }
  try {
    const apiKey = String(process.env.NVIDIA_API_KEY || '').trim();
    if (!apiKey) return json(res, 500, { error: 'Falta configurar NVIDIA_API_KEY en Vercel.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const image = imageDataUri(body.image);
    const model = process.env.ARCHITECT_VISION_MODEL || 'meta/muse-glimmer-30b';
    const upstream = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + apiKey,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: prompt(body.instruction) },
          { role: 'user', content: [
            { type: 'text', text: 'Analiza esta imagen y devuelve el JSON solicitado.' },
            { type: 'image_url', image_url: { url: image } }
          ] }
        ]
      })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = result && result.error && (result.error.message || result.error.type);
      return json(res, upstream.status, { error: 'NVIDIA respondió ' + upstream.status + (detail ? ': ' + detail : '.') });
    }
    const content = result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (typeof content !== 'string' || !content.trim()) return json(res, 502, { error: 'La IA no devolvió un análisis.' });
    return json(res, 200, { model, content });
  } catch (error) {
    return json(res, 400, { error: error && error.message ? error.message : 'Error procesando la imagen.' });
  }
};
