// ============================================================
//  Code.gs — Orquestador principal
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🖨️ Cotizador 3D")
    .addItem("Importar G-code...", "mostrarDialogo")
    .addSeparator()
    .addItem("Inicializar hojas", "inicializarHojas")
    .addItem("Limpiar miniaturas huérfanas", "limpiarMiniaturasHuerfanas")
    .addToUi();
}

function mostrarDialogo() {
  const html = HtmlService
    .createTemplateFromFile("Dialog")
    .evaluate()
    .setWidth(560)
    .setHeight(820)
    .setTitle("Importar G-code de Creality Print");
  SpreadsheetApp.getUi().showModalDialog(html, "Importar G-code");
}

function inicializarHojas() {
  Hoja.inicializar();
  Config.inicializar();
  SpreadsheetApp.getUi().alert(
    `✅ Hojas inicializadas correctamente.\n\n` +
    `Las tarifas se editan en la hoja "${Config.HOJA}", columna Valor.`
  );
}

/**
 * Mantenimiento: envía a la papelera de Drive las miniaturas de la carpeta
 * "Cotizador3D_Miniaturas" que ya no estén enlazadas en ninguna celda del
 * documento —las que quedaron sueltas al borrar cotizaciones.
 *
 * Pide confirmación mostrando la lista antes de borrar nada, y usa la papelera
 * en vez de un borrado definitivo para que se puedan recuperar.
 */
function limpiarMiniaturasHuerfanas() {
  const ui = SpreadsheetApp.getUi();
  const analisis = Drive.analizarMiniaturas(Hoja.textoDelLibro());

  if (analisis.total === 0) {
    ui.alert(`No hay miniaturas en la carpeta "${Drive.CARPETA}".`);
    return;
  }
  if (analisis.huerfanas.length === 0) {
    ui.alert(
      `Nada que borrar.\n\n` +
      `Las ${analisis.referenciadas} miniaturas de la carpeta están enlazadas en el documento.`
    );
    return;
  }

  const MUESTRA = 15;
  const lista = analisis.huerfanas.slice(0, MUESTRA).map(h => `• ${h.nombre}`);
  if (analisis.huerfanas.length > MUESTRA) {
    lista.push(`…y ${analisis.huerfanas.length - MUESTRA} más`);
  }

  const respuesta = ui.alert(
    "Limpiar miniaturas huérfanas",
    `${analisis.huerfanas.length} de ${analisis.total} miniaturas ya no están enlazadas ` +
    `en ninguna celda del documento:\n\n${lista.join("\n")}\n\n` +
    `Se enviarán a la papelera de Drive, de donde se pueden recuperar. ¿Continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (respuesta !== ui.Button.YES) {
    ui.alert("Cancelado. No se borró ninguna miniatura.");
    return;
  }

  const r = Drive.enviarAPapelera(analisis.huerfanas);
  const lineas = [`✅ ${r.enviadas} miniaturas enviadas a la papelera de Drive.`];
  if (analisis.omitidas.length) {
    lineas.push("", `Se dejaron ${analisis.omitidas.length} archivos que no son imágenes:`,
                ...analisis.omitidas.slice(0, 10));
  }
  if (r.errores.length) {
    lineas.push("", `⚠️ No se pudieron borrar ${r.errores.length}:`, ...r.errores.slice(0, 10));
  }
  ui.alert(lineas.join("\n"));
}

// ── Llamados desde el diálogo ─────────────────────────────────

// Devuelve el catálogo de insumos para poblar el dropdown
function obtenerCatalogoInsumos() {
  return Hoja.leerCatalogoInsumos();
}

// Tarifas vigentes para el preview del diálogo. El cliente NO define
// tarifas propias: usa estas, las mismas que aplica el servidor al guardar.
function obtenerConfiguracion() {
  return { parametros: Config.tarifasConMetadatos() };
}

// Guarda la cotización completa con sus insumos
function guardarCotizacion(datos) {
  try {
    const costos      = Calculadora.calcular(datos, Config.tarifas());
    const idCotizacion = Hoja.siguienteId();
    const imagenUrl   = datos.thumbnailBase64
      ? Drive.guardarMiniatura(datos.thumbnailBase64, datos.nombrePieza)
      : "";

    Hoja.agregarFilaCotizacion(idCotizacion, datos, costos, imagenUrl);

    if (datos.insumos && datos.insumos.length > 0) {
      const insumosProcesados = Hoja.procesarInsumos(datos.insumos);
      Hoja.agregarFilasInsumos(idCotizacion, insumosProcesados, datos.unidadesPorCama || 1);
    }

    return { ok: true, mensaje: "Cotización guardada correctamente." };
  } catch (e) {
    return { ok: false, mensaje: e.message };
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}