# Validación del prototipo

Fecha: 5 de noviembre de 2026. Motor Cavern fijado al commit indicado en README.md. No se incluyen los archivos de audio del usuario en el repositorio ni en el paquete de la web.

## Comprobaciones realizadas

- Compilación Release WebAssembly con AOT: completada.
- Instalación repetible de `wasm-tools` y verificación explícita de firmas de los paquetes NuGet: completadas. El verificador emitió avisos de revocación por no poder contactar servidores CRL desde la red restringida; no se desactivaron las comprobaciones TLS ni de firma.
- Pruebas nativas: encabezado WAVEFORMATEXTENSIBLE, 16 canales, 48 kHz, longitud de datos, máscara explícitamente sin asignar, límite RIFF y rechazo de entrada inválida/no JOC. Ocho comprobaciones sin muestra; diez al añadir el fragmento EC3 compatible usado en pruebas.
- Conversión nativa completa del M4A aportado por el usuario: completada.
- Conversión del mismo M4A completo en **Chromium**, sirviendo la versión Release estática: completada en **92,3 segundos**, incluida la copia de la descarga. Es un resultado de esta máquina, no una garantía de rendimiento en otros dispositivos.
- Descarga del WAV, mapa JSON de 16 canales y borrado del temporal OPFS: completados en Chromium.
- Monitorización de las peticiones de la aplicación durante esa prueba: ninguna subida, ningún POST y ninguna petición a terceros. Solo se descargaron recursos estáticos del mismo origen.
- Rechazo de un EC3 inválido en el navegador sin ofrecer una descarga: comprobado.
- UI de producción: detección inicial de inglés/español, selector ES/EN, traducción de validaciones existentes, persistencia tras recargar y estado accesible del selector: comprobados.
- Capturas y ausencia de desbordamiento horizontal a 320 y 390 píxeles en ambos idiomas: comprobados.

## Resultado del M4A completo

| Propiedad | Resultado |
|---|---|
| Códec de salida | PCM IEEE float32 LE |
| Canales | 16 |
| Frecuencia | 48.000 Hz |
| Tamaño | 746.618.960 bytes |
| Duración del WAV | 243,040 segundos |
| Duración declarada por el M4A | 242,973604 segundos |
| Diferencia | +66,396 ms |
| Canales con señal | 16 de 16 |
| Muestras NaN/infinitas | Ninguna |
| Pico máximo | −10,116475 dBFS |

FFprobe y FFmpeg analizaron el WAV descargado desde el navegador. El RMS por canal coincide con el render nativo de Cavern al nivel de precisión mostrado por FFmpeg. Esto no constituye una comparación con el renderizador de referencia Dolby ni prueba una equivalencia acústica con él.

## Límites observados

La diferencia de duración se conserva y se informa; no se ha validado el tratamiento exacto de las listas de edición del MP4. Un fragmento MP4 remultiplexado durante las pruebas no fue identificado como JOC por Cavern, aunque su audio EC3 extraído sí se decodificó. Los bytes iniciales del audio extraído coincidían: es una limitación del camino de lectura del contenedor que aún debe investigarse. El M4A original del usuario sí pasó la conversión completa. No se garantiza compatibilidad con todos los MP4/M4A.

La salida requiere asignar el orden de canales usando el JSON: la máscara WAVE es cero para no declarar una distribución incorrecta. No hay prueba de reproducción o asignación automática en todas las DAW. Las capturas móviles verifican el diseño, no el rendimiento de la conversión en teléfonos reales. No se han probado Safari ni Firefox con la canción completa.

## Repetición

Consulta README.md para compilar y servir internamente `dist/wwwroot`. Con Playwright y Chromium disponibles:

```sh
node tests/browser-ui.cjs
node tests/browser-smoke.cjs /ruta/muestra.m4a /tmp/salida.wav
```

Las muestras compatibles deben ser proporcionadas por el usuario. No se sustituyeron las pruebas de audio por una descarga simulada ni por un WAV rellenado con ceros.
