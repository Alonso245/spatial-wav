# Correcciones de objetos y metadatos OAMD

Se mantienen la versión fijada de Cavern, las licencias y las atribuciones. `scripts/prepare-decoder.py` aplica de forma repetible los cambios siguientes y falla si el código de origen esperado no coincide.

## Problemas reproducidos

1. **Extensión de objetos:** un objeto de una muestra tenía tamaño `1.0654931`. El panner usa el tamaño como mezcla entre una fuente puntual y una extensión de sala completa. `1 - size` resultaba negativo, y la raíz cuadrada usada para distribuir energía producía NaN alrededor de `0.545333 s`. El audio de los objetos seguía siendo finito. La corrección satura ese factor de mezcla al intervalo `[0, 1]` sin modificar el tamaño almacenado en los metadatos.
2. **Longitud de elementos OAMD:** `oa_element_size` representa un número de bytes menos uno y su origen está después del campo de longitud variable. El lector lo trataba como bits y usaba la posición anterior a ese campo. En elementos consecutivos terminaba interpretando otros datos como metadatos de objetos. La corrección calcula el final con las unidades y el origen correctos, y comprueba que no exceda el contenido disponible.
3. **Actualizaciones parciales:** los indicadores de ganancia y prioridad de `obj_basic_info_bits` estaban intercambiados. Las actualizaciones que contenían solo uno de esos campos perdían la alineación. La ganancia corresponde al bit 0 y la prioridad al bit 1.

La lectura se contrastó con el paquete independiente `oamd` **0.1.0**, publicado en crates.io (SHA-256 del paquete: `76c4b9119cf66c5cdbc555ac0dbb9607a92a71e8fd6409c3217f429c05872f93`). Se consultó como referencia de formato; no se incorpora ni se ejecuta como dependencia de la web.

## Protección y pruebas

La protección contra PCM NaN/infinito permanece en `Converter.Render`. No se reemplazan muestras inválidas por ceros, no se omiten fotogramas para terminar una conversión y no se convierte un fallo en un upmix 5.1 etiquetado como 9.1.6.

Las pruebas nativas incluyen 33 comprobaciones: formatos, límites RIFF, tamaños de objetos dentro y fuera de la sala, conservación de los metadatos, longitudes OAMD con uno y varios grupos, límite de lectura, actualizaciones parciales de ganancia/prioridad y límites de los bloques de relleno MP4. Las pruebas reproducen los errores con las versiones anteriores de los lectores.

Se convirtieron completas tres muestras proporcionadas por el usuario. Los archivos no se incluyen en Git.

| Muestra | Conversión nativa | Chromium / WebAssembly | WAV descargado |
|---|---|---|---|
| A, entrada de 209,536875 s | Completada | Completada, 46,2 s en la máquina de prueba | 16 canales, 48 kHz, float32; 643.989.584 bytes |
| B, entrada de 260,0635 s | Completada | Completada, 54,6 s en la máquina de prueba | 16 canales, 48 kHz, float32; 799.113.296 bytes |
| Referencia que ya funcionaba, 242,973604 s | Completada | Validada previamente | El nuevo WAV nativo es idéntico, byte por byte, al producido antes de estas correcciones |

En Chromium se comprobaron además la descarga real, el mapa de canales, la limpieza del temporal y la ausencia de subidas de audio o peticiones de la aplicación a terceros. Los tiempos anteriores no garantizan el mismo rendimiento en otros equipos.

FFmpeg analizó los dos WAV descargados: ambos contienen 16 canales y ninguna muestra NaN/infinita. En A hay señal en 15 canales y silencio en LFE; una decodificación independiente del audio base también confirma que el LFE de la entrada está en silencio. En B hay señal en los 16 canales. No se añadió señal artificial a canales silenciosos.

Se conserva la limitación de duración documentada anteriormente: los WAV A y B duran 209,632 s y 260,128 s, respectivamente, incluyendo el margen del lector del contenedor. No se ha implementado aquí un cambio en el tratamiento de listas de edición MP4. La corrección tampoco implica equivalencia con un renderizador de referencia Dolby.

## Bloques de relleno al final del M4A

Una nueva muestra de 20.831.772 bytes termina con un bloque `free` válido de 67 bytes. La versión anterior saltaba ese bloque y llamaba recursivamente a `Parse` incluso al final del archivo. Entonces leía una cabecera inexistente e intentaba buscar una posición de varios gigabytes.

`FileStream` permitía esa búsqueda fuera del archivo y por eso la primera prueba nativa no detectaba el problema. `MemoryStream`, usado por la página, la rechaza con `ArgumentOutOfRangeException`. El error genérico del navegador ocultaba esta diferencia de lectura.

El adaptador devuelve ahora el bloque de relleno como un bloque normal. Los bucles del contenedor y del elemento padre controlan cuándo termina la lectura. Las pruebas cubren relleno al final del archivo, antes de otro bloque y al final de un elemento anidado. Con el lector anterior fallan sobre un `MemoryStream`.

Las conversiones nativas de muestras proporcionadas por el usuario también usan ahora `MemoryStream`, como la aplicación. Cuatro archivos completos pasaron este camino y sus WAV son idénticos, byte por byte, a las referencias obtenidas desde disco. El WAV de la nueva muestra tiene 16 canales float32 a 48 kHz, duración de 183,29 s y tamaño de 563.066.960 bytes. No se cambian el audio codificado ni las protecciones contra muestras inválidas.

La muestra nueva completó además una conversión y descarga reales en Chromium con la compilación WebAssembly local corregida (47,3 s en esta máquina). Pasaron las comprobaciones del encabezado WAV, mapa JSON, borrado del temporal y ausencia de subidas o solicitudes de la aplicación a terceros. Esta comprobación corresponde a la versión local, no a un despliegue publicado.
