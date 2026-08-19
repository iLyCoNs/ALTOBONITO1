# Proxy de lectura visual del modo Arquitecto

La clave de NVIDIA no se guarda en el frontend ni en el repositorio. Inicia el
proxy con una variable de entorno:

```powershell
$env:NVIDIA_API_KEY = 'PON_AQUI_LA_CLAVE_NUEVA'
npm run architect-vision
```

El proxy queda en `http://localhost:8787`. La interfaz usa ese endpoint por
defecto; para un despliegue remoto se puede definir antes de cargar la app:

```html
<script>window.ARCHITECT_VISION_ENDPOINT='https://tu-dominio/api/architect/analyze'</script>
```

El modelo se puede cambiar sin modificar código mediante
`ARCHITECT_VISION_MODEL`. La respuesta se limita a geometrías JSON de calles,
lotes y divisiones, que la interfaz muestra para confirmación antes de crear
elementos.
