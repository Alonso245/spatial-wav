# Spatial / WAV — navegador, 9.1.6

Prototipo gratuito y sin anuncios para convertir **E-AC-3/JOC** (`.ec3`, `.eac3`, `.m4a`, `.mp4`) en un WAV de 16 canales: float32 o PCM de 16 bits, a 44.1, 48 o 96 kHz (48 kHz/float32 por defecto). La página y el motor se descargan de un alojamiento estático. Después, el audio se procesa en el dispositivo del visitante, sin Flask, FFmpeg, Dolby Reference Player ni servidor de conversión instalado en su computadora. La interfaz incluye español e inglés, detecta el idioma inicial del navegador y guarda la elección del selector ES/EN en el dispositivo. La marca visible es **Spatial / WAV**.

## Diferencia respecto al ZIP original

El ZIP envía el audio a Flask y ejecuta los plugins GStreamer de Dolby en macOS. Esta implementación ejecuta [Cavern](https://github.com/VoidXH/Cavern), de [Bence Sgánetz](https://en.sbence.hu), mediante .NET WebAssembly. Cavern incluye decodificación JOC y renderizado de objetos; **no se promete equivalencia con el renderizador de Dolby**. FFmpeg por sí solo no sustituye el renderizado de objetos Atmos. El ejemplo MPEG-H utiliza otro códec y su decodificador no sirve para E-AC-3/JOC.

El archivo debe contener JOC con objetos detectables al inicio. Se rechaza audio estéreo/5.1 sin objetos en lugar de rellenar 16 canales. La detección inicial no garantiza que cada fotograma contenga metadatos válidos; Cavern tiene su propio comportamiento de recuperación. Comprueba el render en una DAW.

## Compilar

Necesita .NET SDK **8.0.408** (o parche compatible de 8.0.4xx), Python 3 y Git. Desde la raíz del repositorio:

```sh
bash scripts/install-wasm-tools.sh
bash scripts/build.sh
```

El script obtiene Cavern en `.deps/Cavern`, fija el commit `7f530786b67f80cfaf0a7cf17187a8f5f680025d` y aplica un adaptador de ejecución secuencial a las operaciones JOC y al paralelizador. El navegador no necesita hilos WASM, `SharedArrayBuffer` ni cabeceras COOP/COEP. Las adaptaciones incluyen correcciones del tamaño de objetos, la lectura de metadatos OAMD y los bloques de relleno del contenedor MP4; se documentan en [docs/DECODER-FIXES.md](docs/DECODER-FIXES.md). La compilación genera `dist/wwwroot/`. Release compila el motor mediante AOT; la primera compilación tarda varios minutos y las siguientes reutilizan resultados. Debug usa ejecución interpretada y es considerablemente más lento para convertir audio.

`DOTNET_CLI_HOME` y `NUGET_PACKAGES` pueden configurarse para otros sistemas. En este entorno el SDK está en `/workspace/.tools/dotnet`; añádelo a `PATH`. Las variables predeterminadas del script usan ubicaciones escribibles bajo `/workspace`.

## Probar durante el desarrollo

```sh
export PATH=/workspace/.tools/dotnet:$PATH
export DOTNET_CLI_HOME=/workspace/.dotnet-cli
export NUGET_PACKAGES=/workspace/.nuget/packages
dotnet run --project tests/Smoke -c Release
# Opcional: render real con un archivo propio, sin incluirlo en Git:
dotnet run --project tests/Smoke -c Release -- /ruta/audio.m4a /tmp/render.wav
# Servidor de archivos solo para desarrollo:
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist/wwwroot
```

Las pruebas comprueban el encabezado WAV, límites RIFF y rechazo de datos inválidos; cuando se proporciona una muestra, ejecutan el render JOC completo. El navegador debe probarse por separado: la prueba nativa no verifica WebAssembly ni OPFS.

## Varios archivos y arrastrar y soltar

Se pueden seleccionar varios archivos o soltarlos sobre el conversor. Las selecciones posteriores se añaden a la cola, incluso después de terminar conversiones. La cola admite hasta 20 entradas y cada archivo mantiene el límite de 128 MiB. Las fuentes se conservan como referencias `File` del navegador y se carga solo una en la memoria de WebAssembly a la vez.

La conversión es secuencial. Cada WAV terminado tiene un archivo OPFS independiente y su propio botón de descarga y mapa JSON. Un error de formato o almacenamiento elimina únicamente la salida parcial de ese archivo y permite continuar con los siguientes. Los ajustes de bits y frecuencia se guardan con cada resultado; modificarlos para otra conversión no cambia los anteriores.

**Detener cola** cancela el archivo activo y deja los siguientes pendientes; vuelve a pulsar convertir para reintentar los cancelados o fallidos. Los resultados terminados se conservan. **Nueva conversión** vacía toda la cola y elimina sus salidas locales; la × de cada fila elimina solo esa entrada. Las descargas individuales siguen disponibles. **Descargar todos** reúne los resultados listos y sus mapas JSON en una única descarga ZIP; no genera el archivo hasta que se pulsa el botón.

La lista de archivos es desplegable y mantiene la elección de abrir/cerrar mientras cambia la cola. El ZIP usa STORE (sin compresión) y cabeceras ZIP64: copia los WAV sin modificar ninguna muestra. Se escribe en OPFS por bloques y calcula CRC32 durante la copia, sin cargar todos los audios ni el archivo ZIP completo en RAM. Requiere espacio temporal adicional aproximadamente igual a los WAV reunidos. Un indicador muestra su progreso y **Cancelar ZIP** elimina solo el ZIP parcial; los WAV siguen disponibles. Si no hay cambios, una segunda descarga reutiliza el ZIP terminado. Al eliminar entradas o vaciar la cola se elimina también el ZIP temporal.

## Formato de salida y límites

- Orden de canales: **L, R, C, LFE, Lrs, Rrs, Ls, Rs, Lw, Rw, Ltf, Rtf, Ltm, Rtm, Ltr, Rtr** (Cavern `ref916`, con superiores medios/laterales).
- WAVEFORMATEXTENSIBLE, subformato IEEE float32 o PCM de 16 bits y máscara de altavoces **0**. La máscara WAVE no representa esta distribución de forma inequívoca. Descarga también el JSON y asigna explícitamente los canales en la DAW. No presupongas el orden del plugin Dolby del ZIP.
- La exportación a 16 bits aplica dithering TPDF antes de cuantizar. Reduce la precisión y no es reversible. Si la señal supera el rango entero (incluidos posibles picos del remuestreo), se cancela y se recomienda float32, sin recortar ni normalizar silenciosamente el audio. A 48 kHz/float32 se conservan exactamente las muestras del render anterior.
- El WAV contiene un render de altavoces, no objetos editables ni un máster Atmos.
- Fuente a 48 kHz; el render se mantiene a esa frecuencia y la exportación permite 44.1, 48 o 96 kHz. El remuestreo usa sinc de ventana Blackman de 96 coeficientes por fase, con filtrado antialias. Aumentar la frecuencia no añade detalle. Entrada máxima de 128 MiB, cargada en memoria. Se rechazan salidas por encima del límite RIFF de 4 GiB; no hay RF64 todavía.
- La salida se escribe por bloques en OPFS. Necesita espacio local: unos **184 MB por minuto** de audio a 48 kHz/float32; la mitad a 16 bits y el doble a 96 kHz. El navegador puede imponer una cuota menor. Los errores o cancelación eliminan la salida parcial.
- Usa un navegador moderno y HTTPS. WebAssembly y OPFS son obligatorios; modos privados, cuotas de almacenamiento o restricciones móviles pueden impedir el proceso. No se ha validado compatibilidad general en móviles.
- Mantén la pestaña abierta. La ejecución es cooperativa en el hilo del navegador y cede el control por bloques; aún no utiliza un Web Worker dedicado. El rendimiento puede ser inferior al de una aplicación nativa.
- No se admite TrueHD, DRM ni descifrado. En MP4/M4A, Cavern selecciona su pista principal de audio; no hay selector de pistas.
- Cada salida temporal se elimina al quitar su entrada de la cola, pulsar **Nueva conversión** o, como mejor esfuerzo, al cerrar la pestaña. Si el navegador se cierra inesperadamente, puede quedar un temporal: borra los datos de este sitio desde la configuración del navegador.

## Privacidad

El código de la aplicación no hace peticiones de subida ni envía el audio a una API. Solo se descargan los archivos estáticos del motor. La primera visita requiere conexión; todavía no hay caché de aplicación/PWA para iniciar sin conexión. No hay analítica ni recursos de terceros en la interfaz.

Los resultados y límites de las pruebas realizadas se describen en [docs/VALIDATION.md](docs/VALIDATION.md).

## Apariencia y descargas

En la primera visita, una pantalla tenue permite elegir modo claro o noche antes de mostrar la interfaz. La preferencia se guarda localmente y el botón de apariencia permite cambiarla después. La pantalla inicial y el tema se aplican antes de arrancar WebAssembly para evitar un destello claro.

La interfaz usa DM Sans y Newsreader, servidas desde `wwwroot/fonts` sin llamadas a proveedores externos. Los archivos proceden de los paquetes Fontsource Variable 5.3.0; sus licencias OFL acompañan a las fuentes.

Al completar un solo archivo, la selección y el botón de convertir se sustituyen por un resultado con un check pequeño y una única descarga principal. Con varios archivos, los resultados permanecen en la lista desplegable y aparece una descarga conjunta en ZIP para los archivos listos. El mapa de canales queda en un desplegable. Nueva conversión elimina el temporal y restablece la selección sin recargar. Al descargar se muestra un indicador de preparación y luego «Descarga iniciada»: no se afirma que el navegador haya terminado de guardar el archivo.
