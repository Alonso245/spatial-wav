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

## Exportación configurable (5 de noviembre de 2026)

- 64 comprobaciones nativas, incluidas las regresiones anteriores y las seis combinaciones de 16-bit PCM / 32-bit float con 44.1, 48 y 96 kHz. Se verifican cabeceras, duración exacta redondeada al fotograma, independencia de canales, límites de bloques y vuelta del búfer circular.
- Señal de 1 kHz: amplitud RMS conservada; impulsos: sin retraso añadido. En la conversión a 44.1 kHz, un tono de 23 kHz queda atenuado más de 70 dB para evitar aliasing.
- Dithering TPDF a 16 bits: ruido acotado y sin sesgo medible en la prueba. Se rechazan muestras no finitas y señales fuera del rango entero; no se normaliza ni recorta la música automáticamente.
- «Whiplash (English Version)» completa, entrada MemoryStream: la exportación predeterminada a 48 kHz/float32 coincide byte por byte con el WAV anterior. La exportación a 44.1 kHz/PCM16 termina con 258,658,928 bytes; ffprobe confirma 16 canales y 183.29 s, igual duración que el render predeterminado.
- Chromium con el motor WebAssembly AOT: las seis combinaciones convierten un fragmento JOC real, descargan WAV y JSON concordantes y eliminan la salida temporal al reiniciar. Se verificaron ES/EN, temas claro/oscuro, anchuras de 320/390/1280 px, controles bloqueados durante el proceso y animación desactivada con movimiento reducido. No hubo subidas ni excepciones del navegador. Las pruebas móviles comprueban el diseño en Chromium de escritorio, no rendimiento en teléfonos reales.
- El render de objetos sigue trabajando a 48 kHz. La conversión de frecuencia ocurre después, sobre los 16 canales, con sinc de ventana Blackman de 96 coeficientes. No recupera información ausente de la fuente ni modifica las limitaciones conocidas de las listas de edición MP4.

Para repetir las pruebas de exportación reales en el navegador con un fragmento corto compatible:

```sh
node tests/browser-export.cjs /ruta/fragmento.ec3
# También se puede escoger el formato en la prueba nativa:
dotnet run --project tests/Smoke -c Release -- /ruta/audio.m4a /tmp/render.wav 16 44100
```


## Cola, arrastre y ZIP (8 de noviembre de 2026)

- Chromium con compilación WebAssembly AOT: selección múltiple nativa, botón «Añadir archivos», arrastre real con `DataTransfer`, adición de nuevas selecciones sin perder las anteriores, nombres repetidos y arrastre sobre el panel tras terminar una tanda.
- Conversión secuencial de fragmentos E-AC-3/JOC reales: un archivo malformado no impide convertir los siguientes; las descargas anteriores mantienen sus bytes y sus ajustes aunque se añadan archivos con otro formato. Un fallo simulado de escritura elimina solo el resultado parcial afectado. Se comprobó detener, reanudar, reintentar y vaciar la cola, así como el límite de 20 entradas.
- Las excepciones de archivo controladas se registran en stdout. En Blazor, stderr activa el aviso crítico general; estos errores esperados ahora quedan en el mensaje de su archivo, sin mostrar falsamente que el motor no cargó.
- «Whiplash (English Version)» completa mediante el nuevo puente `File`/`IJSStreamReference`: conversión y descarga de 563,066,960 bytes, 16 canales, 48 kHz/float32, 183.29 s. El WAV coincide byte por byte con la descarga pública anterior a este cambio. La prueba local tardó aproximadamente 38 s, incluida la escritura; no es una promesa de rendimiento en otros equipos.
- ZIP generado únicamente al pulsar descargar todos. Las pruebas verifican CRC32, nombres Unicode, nombres repetidos diferenciados, exclusión de archivos fallidos, mapas JSON concordantes y coincidencia byte por byte entre los WAV individuales y los del ZIP. Se probaron resultados mezclados de float32/48 kHz y PCM16/44.1 kHz.
- El ZIP usa STORE con cabeceras ZIP64 y copia `File.stream()` hacia OPFS. El test del navegador bloquea llamadas a `Blob.arrayBuffer()` sobre blobs mayores de 64 KiB para detectar acumulaciones de audios completos; las descargas conjuntas siguen funcionando. No se han probado archivos ZIP de más de 4 GiB en un dispositivo real.
- La integridad ZIP64 se comprobó también con Python `zipfile`, el vector CRC32 conocido «123456789», una entrada vacía, Unicode y `unzip -t`. No se ha validado el extractor nativo de macOS en hardware real.
- Cancelar el ZIP elimina el parcial y conserva los WAV. Un fallo simulado de cuota permite reintentar y seguir descargando individualmente. Repetir una descarga sin cambios reutiliza el ZIP; quitar entradas, vaciar la cola o iniciar otra conversión elimina la copia temporal. La limpieza mantiene desactivados los controles hasta terminar para evitar cambios concurrentes en la cola.
- Lista desplegable, tema claro/oscuro, ES/EN y anchuras 320/390/1280 px comprobados. La preferencia de movimiento reducido desactiva las animaciones. También pasaron las regresiones de descarga individual, indicador de preparación, selección de tema, fuentes locales y formatos de exportación, y las 64 comprobaciones nativas de audio. Las pruebas no realizaron subidas ni peticiones a terceros.

Para repetir con muestras privadas compatibles (no incluidas en el repositorio), prepara primero dos fragmentos EC3 de 1.056 s y 0.512 s mediante copia de la pista E-AC-3:

```sh
ffmpeg -i /ruta/muestra.m4a -map 0:a:0 -t 1.056 -c:a copy /tmp/spatial-night-sample.ec3
ffmpeg -i /tmp/spatial-night-sample.ec3 -t 0.512 -c:a copy /tmp/spatial-batch-short.ec3
# Sirve dist/wwwroot en 127.0.0.1:8080 después de compilar.
node tests/browser-batch.cjs
node tests/browser-archive.cjs
node tests/zip-format.cjs
```

La compilación quedó en el borrador. Esta validación no implica una publicación nueva en GitHub Pages.
