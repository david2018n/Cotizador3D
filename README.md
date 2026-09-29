# Cotizador3D

Cotizador de impresiones 3D construido sobre **Google Apps Script** + **Google Sheets**.
Lee un archivo `.gcode` exportado por Creality Print, extrae tiempo, filamento, dimensiones
y miniatura, calcula el costo y el precio de venta, y guarda la cotización en la hoja.

- **Proyecto Apps Script:** [`Cotizador3D`](https://script.google.com/d/1c5yEiUEPAlENjz5DKhqoHMyqMuFkwWGEaZYvGr-nhKnBeZUrBKCkgFns/edit)
- **Repositorio:** https://github.com/david2018n/Cotizador3D
- **Especificación de la que salió:** [`docs/spec-original.md`](docs/spec-original.md)

Con 1 unidad por cama y sin insumos, el cálculo se reduce exactamente a las fórmulas de esa
especificación; está verificado contra una implementación independiente de ella.

## Estructura

Todo el código del proyecto Apps Script vive en `src/`. La raíz guarda configuración y documentación.

| Archivo | Rol |
|---|---|
| `src/appsscript.json` | Manifiesto. Runtime V8, zona horaria `America/Bogota` |
| `src/Code.js` | **Orquestador activo.** Menú, diálogo, `guardarCotizacion()`, `include()` |
| `src/Config.js` | Lee las tarifas de la hoja `Parámetros`; valores por defecto y validación |
| `src/Calculadora.js` | Lógica de negocio: consumo por impresora y cálculo de costos |
| `src/Hoja.js` | Acceso a Sheets: encabezados, IDs, catálogo de insumos, escritura de filas |
| `src/Drive.js` | Guarda la miniatura PNG en Drive y devuelve la URL pública |
| `src/Dialog.html` | Estructura del diálogo modal (formulario + preview de costos) |
| `src/Script.html` | JS del cliente: parser de G-code, preview en vivo, envío al servidor |
| `src/Styles.html` | CSS del diálogo |

## Flujo

```
.gcode  ──►  Script.html (parser en el navegador)
             · thumbnail   ; thumbnail begin WxH … end   → base64 PNG
             · tiempo      ; estimated printing time (normal mode) = …
             ·             ;TIME_ELAPSED:…                (fallback)
             · filamento   ; filament used [g] = …
             · costo real  ; total filament cost = …     (si existe, manda sobre $/g)
             · dimensiones ; MINX/MAXX/MINY/MAXY/MINZ/MAXZ
             · objetos     ; printing object <nombre> id:N
             · multicolor  líneas T0/T1/… (más de una herramienta)
                            │
                            ▼  preview de costos en vivo (mismas fórmulas del servidor)
                            │
             google.script.run.guardarCotizacion(datos)
                            │
                            ▼
  Code.js ──► Calculadora.calcular()   → costos
          ──► Drive.guardarMiniatura() → URL pública del PNG
          ──► Hoja.agregarFilaCotizacion() + Hoja.agregarFilasInsumos()
```

## Modelo de costos

### Tarifas — editables desde la hoja

Las cuatro tarifas viven en la hoja **`Parámetros`**, columna `Valor`. Son la única fuente de
verdad en ejecución: las usa el servidor al guardar y el diálogo para el preview, así que no
pueden divergir. Cambiar una tarifa es editar una celda; el diálogo las recarga al abrirse.

| Clave | Por defecto | Unidad |
|---|---|---|
| `filamentoPorGramo` | 80 | $/g |
| `energiaPorKwh` | 770 | $/kWh |
| `mantenimientoPct` | 5% | % del subtotal (celda con formato de porcentaje) |
| `multiplicadorVenta` | 3.00 | × sobre el costo |

Comportamiento de `src/Config.js`:

- La hoja se crea y se siembra sola la primera vez que se necesita — no hace falta ejecutar
  `Inicializar hojas`, aunque ese menú también la crea.
- Si el código gana una tarifa nueva, se agrega a la hoja sin tocar los valores ya editados.
- Un valor vacío, no numérico o negativo cae al valor por defecto y deja un aviso en
  `console.warn` (visible en Ejecuciones del editor). Nunca detiene el guardado.
- Se acepta coma decimal: `80,5` se lee como 80.5.
- Los valores por defecto de la tabla anterior están en `DEFECTOS`, dentro de `src/Config.js`.

### Consumo por impresora

Sigue en `src/Calculadora.js` (`IMPRESORAS`), aún no parametrizable:

| Impresora | Calentamiento | Impresión |
|---|---|---|
| Ender 3 S1 Pro | 0.0360 kWh | 152 W |
| Creality HI | 0.0288 kWh | 180 W |

```
kWh          = kwhCalentamiento + (wImpresion / 1000) × tiempoHoras
filamento    = gramos × 80
energía      = kWh × 770
subtotal     = filamento + energía
mantenimiento= subtotal × 0.05
totalCama    = subtotal + mantenimiento
costoImpr/u  = totalCama / piezasEnCama
insumos/u    = Σ precio unitario de los insumos
costoTotal/u = costoImpr/u + insumos/u
precioVenta/u= costoTotal/u × 3.0
totalVenta   = precioVenta/u × piezasEnCama
```

## Hojas de cálculo

`Inicializar hojas` (menú 🖨️ Cotizador 3D) crea cuatro hojas:

- **Parámetros** — las tarifas. `Clave · Descripción · Valor · Unidad`; solo se edita `Valor`.
- **Cotizaciones** — una fila por cotización, 23 columnas (ID, miniatura, datos de la pieza, kWh total con 4 decimales, desglose de costos, fecha).
- **Insumos** — catálogo `ID · Nombre · Precio unitario`. Se alimenta solo: si escribes un insumo nuevo en el diálogo, se crea; si cambias el precio de uno existente, se actualiza.
- **Cotizaciones_Insumos** — detalle N:N entre cotizaciones e insumos.

### Migración del esquema de Cotizaciones

La columna `kWh total` se agregó cuando la hoja ya tenía cotizaciones. `Hoja._migrarCotizaciones()`
la inserta en la posición 12 y normaliza el encabezado; corre sola al inicializar o al guardar,
es idempotente y no destructiva —`insertColumnBefore` desplaza las celdas, así que las
cotizaciones anteriores conservan sus valores y solo quedan con la celda de kWh vacía (ese kWh
es recalculable desde `Impresora` y `Tiempo impresión`).

Si el encabezado no corresponde ni al esquema anterior ni al actual, **lanza en vez de escribir**:
es preferible que falle el guardado a que los valores caigan en columnas equivocadas.

Las posiciones de columna (`COLS_MONEDA_COT`, `COLS_DESTACADAS`, miniatura, kWh) se derivan del
array `ENC_COTIZACIONES`, no van a mano, para que agregar o mover una columna no vuelva a
desfasar los formatos.

## Desarrollo

Requiere [clasp](https://github.com/google/clasp) (ya instalado: v3.3.0, autenticado como `juan.d500@gmail.com`).

```bash
clasp status   # lista qué archivos de src/ se subirían
clasp pull     # trae el proyecto remoto a src/  (sobrescribe local)
clasp push     # sube src/ al proyecto remoto    (sobrescribe remoto)
clasp open-script
```

> ⚠️ **`clasp push` reemplaza el contenido del proyecto remoto con lo que haya en `src/`.**
> Haz `clasp pull` antes de empezar si editaste algo directamente en el navegador, para no
> perder cambios.

> 🐛 **clasp 3.3.0 ignora los archivos borrados.** Si eliminas un archivo de `src/`,
> `clasp push` responde `Script is already up to date` y no sube nada — el archivo sigue vivo
> en el proyecto. Verificado con clon fresco. Para borrados usa `clasp push --force`, o borra
> el archivo a mano en el editor de Apps Script. Las modificaciones y los archivos nuevos sí
> se detectan normalmente.

Ciclo recomendado: `clasp pull` → commit ("estado remoto") → editar en local → `clasp push` → commit.

Para comprobar que el remoto y el repo no se han desincronizado, clona el proyecto en una
carpeta temporal y compara con `sha256sum` contra `src/`.

## Problemas conocidos

1. **`=IMAGE("url";4;60;60)` usa `;` como separador**, lo que depende de la configuración
   regional de la hoja. En una hoja en inglés habría que usar `,`.
2. **La URL de miniatura** es del tipo `drive.google.com/uc?export=view&id=…`; Google ha ido
   restringiendo ese formato para incrustar imágenes. Si las miniaturas dejan de verse, es el
   primer sospechoso.
3. **El `kWh total` de las cotizaciones anteriores a la migración está vacío.** Es recalculable
   desde `Impresora` y `Tiempo impresión` si alguna vez se quiere rellenar hacia atrás.
4. **Cosmético:** el `Precio venta/u` redondeado multiplicado por las piezas en cama puede
   diferir del `Total venta (cama)` en uno o dos pesos. Es consecuencia de redondear para
   mostrar; el total es el valor correcto.
5. **El calentamiento de la Creality HI** está declarado como 0.0288 kWh, mientras que
   1150 W × 1,5 min dan 0.02875. Diferencia: $0,04. El código sigue el número de la
   especificación; si algún día se parametrizan las impresoras conviene guardar W y minutos y
   derivar el kWh.

### Resuelto

- **Tarifas duplicadas entre cliente y servidor.** Vivían a la vez en `Calculadora.js` y en
  `Script.html`; había que cambiarlas en dos sitios. Ahora el cliente no define ninguna: las
  pide con `obtenerConfiguracion()` y, mientras no lleguen, el preview no se muestra y
  `Guardar` queda deshabilitado.

- **El preview mostraba un costo de filamento distinto al guardado.** `Script.html` usaba
  `; total filament cost` del G-code en lugar de `gramos × tarifa`, pero nunca lo enviaba al
  servidor: con un G-code que trajera ese comentario, diálogo y hoja diferían en miles de pesos
  (medido: −$1.576 con 100 g). La especificación define el costo como `gramos × tarifa`, así que
  se eliminó el atajo.

- **El preview derivaba unos pesos del valor guardado.** Redondeaba en cada paso intermedio
  mientras el servidor calcula a precisión completa y redondea solo la salida. Ahora el cliente
  replica la cadena del servidor exactamente; verificado al peso en 8 escenarios.

- **`Total venta (cama)` nunca recibía formato de moneda:** `COLS_MONEDA_COT` llegaba hasta la
  columna 20 y esa columna era la 21. Se veía como `95.495$` en lugar de `$95.495`.

- **`COLS_DESTACADAS` resaltaba las columnas equivocadas** (`Costo total/u` y `Precio venta/u`
  en vez de `Precio venta/u` y `Total venta`), off-by-one respecto a su propio comentario.

- **`A1` decía `Hola`** en lugar de `ID`. La migración normaliza todo el encabezado.

- **Los kWh no se mostraban en ninguna parte**, pese a que la especificación los pide con 4
  decimales. Ahora están como columna en `Cotizaciones` y como detalle de la fila de energía en
  el diálogo (`3.4758 kWh × $770`), junto al detalle del filamento (`498,68 g × $80/g`).

- **`Código.js` (monolito legacy), eliminado en `d0d8a0c`.** Declaraba `onOpen`,
  `mostrarDialogo` y `guardarCotizacion` en el mismo ámbito global que `Code.js`; la app
  funcionaba solo porque `Code.js` iba después en el orden del proyecto y sobrescribía sus
  declaraciones. Traía además la tarifa vieja de $75/g. Recuperable en `ec2c7bc` y en la
  versión 1 del proyecto Apps Script.
