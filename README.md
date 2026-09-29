# Cotizador3D

Cotizador de impresiones 3D construido sobre **Google Apps Script** + **Google Sheets**.
Lee un archivo `.gcode` exportado por Creality Print, extrae tiempo, filamento, dimensiones
y miniatura, calcula el costo y el precio de venta, y guarda la cotización en la hoja.

- **Proyecto Apps Script:** [`Cotizador3D`](https://script.google.com/d/1c5yEiUEPAlENjz5DKhqoHMyqMuFkwWGEaZYvGr-nhKnBeZUrBKCkgFns/edit)
- **Repositorio:** https://github.com/david2018n/Cotizador3D

## Estructura

Todo el código del proyecto Apps Script vive en `src/`. La raíz guarda configuración y documentación.

| Archivo | Rol |
|---|---|
| `src/appsscript.json` | Manifiesto. Runtime V8, zona horaria `America/Bogota` |
| `src/Code.js` | **Orquestador activo.** Menú, diálogo, `guardarCotizacion()`, `include()` |
| `src/Calculadora.js` | Lógica de negocio: tarifas, consumo por impresora, cálculo de costos |
| `src/Hoja.js` | Acceso a Sheets: encabezados, IDs, catálogo de insumos, escritura de filas |
| `src/Drive.js` | Guarda la miniatura PNG en Drive y devuelve la URL pública |
| `src/Dialog.html` | Estructura del diálogo modal (formulario + preview de costos) |
| `src/Script.html` | JS del cliente: parser de G-code, preview en vivo, envío al servidor |
| `src/Styles.html` | CSS del diálogo |
| `src/Código.js` | ⚠️ Versión monolítica anterior — ver [Problemas conocidos](#problemas-conocidos) |

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

Tarifas en `src/Calculadora.js` (`TARIFAS`) y consumo por impresora (`IMPRESORAS`):

| Parámetro | Valor |
|---|---|
| Filamento | $80 / g |
| Energía | $770 / kWh |
| Mantenimiento | 5% del subtotal |
| Multiplicador de venta | 3.0 |
| Ender 3 S1 Pro | 0.0360 kWh calentamiento · 152 W impresión |
| Creality HI | 0.0288 kWh calentamiento · 180 W impresión |

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

`Inicializar hojas` (menú 🖨️ Cotizador 3D) crea tres hojas:

- **Cotizaciones** — una fila por cotización, 22 columnas (ID, miniatura, datos de la pieza, desglose de costos, fecha).
- **Insumos** — catálogo `ID · Nombre · Precio unitario`. Se alimenta solo: si escribes un insumo nuevo en el diálogo, se crea; si cambias el precio de uno existente, se actualiza.
- **Cotizaciones_Insumos** — detalle N:N entre cotizaciones e insumos.

## Desarrollo

Requiere [clasp](https://github.com/google/clasp) (ya instalado: v3.3.0, autenticado como `juan.d500@gmail.com`).

```bash
clasp status   # lista qué archivos de src/ se subirían
clasp pull     # trae el proyecto remoto a src/  (sobrescribe local)
clasp push     # sube src/ al proyecto remoto    (sobrescribe remoto)
clasp open-script
```

> ⚠️ **`clasp push` reemplaza el contenido del proyecto remoto con lo que haya en `src/`.**
> Un archivo borrado en local desaparece del editor de Apps Script. Haz `clasp pull` antes
> de empezar si editaste algo directamente en el navegador, para no perder cambios.

Ciclo recomendado: `clasp pull` → commit ("estado remoto") → editar en local → `clasp push` → commit.

## Problemas conocidos

1. **`Código.js` duplica funciones de `Code.js`.** Ambos declaran `onOpen`, `mostrarDialogo` y
   `guardarCotizacion` en el mismo ámbito global de Apps Script. Gana el último archivo en el
   orden del proyecto (hoy `Code.js`, la versión modular), así que la app funciona *por
   casualidad del orden*. Además el `mostrarDialogo` de `Código.js` usa
   `createHtmlOutputFromFile`, que no evalúa los `<?!= include(...) ?>` de `Dialog.html`: si
   alguna vez ganara ese, el diálogo saldría sin CSS ni JS. `Código.js` también trae tarifas
   viejas ($75/g). **Pendiente: borrarlo.**
2. **Las tarifas están duplicadas** en `src/Calculadora.js` (servidor) y `src/Script.html`
   (cliente, para el preview). Hoy coinciden en $80/g, pero hay que cambiarlas en dos sitios o
   el preview mentirá respecto a lo que se guarda.
3. **`=IMAGE("url";4;60;60)` usa `;` como separador**, lo que depende de la configuración
   regional de la hoja. En una hoja en inglés habría que usar `,`.
4. **La URL de miniatura** es del tipo `drive.google.com/uc?export=view&id=…`; Google ha ido
   restringiendo ese formato para incrustar imágenes. Si las miniaturas dejan de verse, es el
   primer sospechoso.
