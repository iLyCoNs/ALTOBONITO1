# Proxy de lectura visual del modo Arquitecto

La clave de NVIDIA no se guarda en el frontend ni en el repositorio. Puedes
crear el archivo local `server/.env` (está excluido por `.gitignore`) con este
contenido:

```text
NVIDIA_API_KEY=PEGA_AQUI_LA_CLAVE_NUEVA
```

Luego inicia el proxy normalmente:

```powershell
npm run architect-vision
```

También se acepta la variable de entorno `NVIDIA_API_KEY`, que tiene prioridad
sobre el archivo local.

El proxy queda en `http://localhost:8787`. Para producción, la función
equivalente está en `api/architect/analyze.js` y Vercel la publica como
`/api/architect/analyze`.

En Vercel configura el secreto `NVIDIA_API_KEY` en Project Settings → Environment
Variables. También puedes configurar `ARCHITECT_VISION_MODEL` si necesitas otro
modelo compatible. La interfaz usa el endpoint de Vercel automáticamente.

Para un endpoint remoto distinto, se puede definir antes de cargar la app:

```html
<script>window.ARCHITECT_VISION_ENDPOINT='https://tu-dominio/api/architect/analyze'</script>
```

El modelo se puede cambiar sin modificar código mediante
`ARCHITECT_VISION_MODEL`. La respuesta se limita a geometrías JSON de calles,
lotes y divisiones, que la interfaz muestra para confirmación antes de crear
elementos.
