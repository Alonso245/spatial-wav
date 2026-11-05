# Spatial / WAV — navegador, 9.1.6

Prototipo gratuito y sin anuncios para convertir **E-AC-3/JOC** (`.ec3`, `.eac3`, `.m4a`, `.mp4`) en un WAV de 16 canales, 48 kHz y float32. La página y el motor se descargan de un alojamiento estático. Después, el audio se procesa en el dispositivo del visitante, sin Flask, FFmpeg, Dolby Reference Player ni servidor de conversión instalado en su computadora. La interfaz incluye español e inglés, detecta el idioma inicial del navegador y guarda la elección del selector ES/EN en el dispositivo. La marca visible es **Spatial / WAV**.

## Diferencia respecto al ZIP original

El ZIP envía el audio a Flask y ejecuta los plugins GStreamer de Dolby en macOS. Esta implementación ejecuta [Cavern](https://github.com/VoidXH/Cavern), de [Bence Sgánetz](https://en.sbence.hu), mediante .NET WebAssembly. Cavern incluye decodificación JOC y renderizado de objetos; **no se promete equivalencia con el renderizador de Dolby**. FFmpeg por sí solo no sustituye el renderizado de objetos Atmos. El ejemplo MPEG-H utiliza otro códec y su decodificador no sirve para E-AC-3/JOC.

El archivo debe contener JOC con objetos detectables al inicio. Se rechaza audio estéreo/5.1 sin objetos en lugar de rellenar 16 canales. La detección inicial no garantiza que cada fotograma contenga metadatos válidos; Cavern tiene su propio comportamiento de recuperación. Comprueba el render en una DAW.

## Compilar

Necesita .NET SDK **8.0.408** (o parche compatible de 8.0.4xx), Python 3 y Git. Desde la raíz del repositorio:

```sh
bash scripts/install-wasm-tools.sh
bash scripts/build.sh
```

El script obtiene Cavern en `.deps/Cavern`, fija el commit `7f530786b67f80cfaf0a7cf17187a8f5f680025d` y aplica un adaptador de ejecución secuencial a las operaciones JOC y al paralelizador. El navegador no necesita hilos WASM, `SharedArrayBuffer` ni cabeceras COOP/COEP. Las adaptaciones incluyen correcciones del tamaño de objetos y de la lectura de metadatos OAMD; se documentan en [docs/DECODER-FIXES.md](docs/DECODER-FIXES.md). La compilación genera `dist/wwwroot/`. Release compila el motor mediante AOT; la primera compilación tarda varios minutos y las siguientes reutilizan resultados. Debug usa ejecución interpretada y es considerablemente más lento para convertir audio.

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

## Publicar una web estática

Sube **el contenido** de `dist/wwwroot/` a un alojamiento HTTPS como GitHub Pages. No subas las muestras de audio. No hace falta un backend; servir los archivos de la web es distinto de ejecutar un servidor en la computadora de cada visitante. El `<base href="./">` permite servirla bajo la ruta del repositorio. El alojamiento debe entregar los archivos `.wasm` como `application/wasm`.

La web publicada en GitHub Pages se sirve desde la rama **gh-pages**, carpeta raíz, con `.nojekyll`. Para actualizarla hay que compilar y subir el contenido de `dist/wwwroot` a esa rama. El flujo de Actions del repositorio es una alternativa de compilación y despliegue; no es el mecanismo de la publicación actual. Antes de distribuir una versión pública, revisa las condiciones de Cavern, incluidas las relativas a uso público. Ser gratuito y no mostrar anuncios no elimina las demás condiciones. Este repositorio no concede derechos sobre Dolby ni sobre los archivos del usuario.

## Formato de salida y límites

- Orden de canales: **L, R, C, LFE, Lrs, Rrs, Ls, Rs, Lw, Rw, Ltf, Rtf, Ltm, Rtm, Ltr, Rtr** (Cavern `ref916`, con superiores medios/laterales).
- WAVEFORMATEXTENSIBLE, subformato IEEE float32 y máscara de altavoces **0**. La máscara WAVE no representa esta distribución de forma inequívoca. Descarga también el JSON y asigna explícitamente los canales en la DAW. No presupongas el orden del plugin Dolby del ZIP.
- El WAV contiene un render de altavoces, no objetos editables ni un máster Atmos.
- Fuente a 48 kHz; no se implementa remuestreo. Entrada máxima de 128 MiB, cargada en memoria. Se rechazan salidas por encima del límite RIFF de 4 GiB; no hay RF64 todavía.
- La salida se escribe por bloques en OPFS. Necesita espacio local: unos **184 MB por minuto** de audio. El navegador puede imponer una cuota menor. Los errores o cancelación eliminan la salida parcial.
- Usa un navegador moderno y HTTPS. WebAssembly y OPFS son obligatorios; modos privados, cuotas de almacenamiento o restricciones móviles pueden impedir el proceso. No se ha validado compatibilidad general en móviles.
- Mantén la pestaña abierta. La ejecución es cooperativa en el hilo del navegador y cede el control por bloques; aún no utiliza un Web Worker dedicado. El rendimiento puede ser inferior al de una aplicación nativa.
- No se admite TrueHD, DRM ni descifrado. En MP4/M4A, Cavern selecciona su pista principal de audio; no hay selector de pistas.
- La salida temporal se elimina al cambiar de archivo, iniciar otra conversión, pulsar **Nueva conversión** o, como mejor esfuerzo, al cerrar la pestaña. Si el navegador se cierra inesperadamente, puede quedar un temporal: borra los datos de este sitio desde la configuración del navegador.

## Privacidad

El código de la aplicación no hace peticiones de subida ni envía el audio a una API. Solo se descargan los archivos estáticos del motor. La primera visita requiere conexión; todavía no hay caché de aplicación/PWA para iniciar sin conexión. No hay analítica ni recursos de terceros en la interfaz.

Los resultados y límites de las pruebas realizadas se describen en [docs/VALIDATION.md](docs/VALIDATION.md).

## Apariencia y descargas

En la primera visita, una pantalla tenue permite elegir modo claro o noche antes de mostrar la interfaz. La preferencia se guarda localmente y el botón de apariencia permite cambiarla después. La pantalla inicial y el tema se aplican antes de arrancar WebAssembly para evitar un destello claro.

La interfaz usa DM Sans y Newsreader, servidas desde `wwwroot/fonts` sin llamadas a proveedores externos. Los archivos proceden de los paquetes Fontsource Variable 5.3.0; sus licencias OFL acompañan a las fuentes.

Al completar una conversión, la selección y el botón de convertir se sustituyen por un resultado con un check pequeño y una única descarga principal. El mapa de canales queda en un desplegable. Nueva conversión elimina el temporal y restablece la selección sin recargar. Al descargar se muestra un indicador de preparación y luego «Descarga iniciada»: no se afirma que el navegador haya terminado de guardar el archivo.
