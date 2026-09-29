// ============================================================
//  Code.gs — Orquestador principal
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🖨️ Cotizador 3D")
    .addItem("Importar G-code...", "mostrarDialogo")
    .addSeparator()
    .addItem("Inicializar hojas", "inicializarHojas")
    .addItem("Rellenar kWh de cotizaciones antiguas", "rellenarKwhHistorico")
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

// Mantenimiento puntual: completa el kWh de las cotizaciones guardadas antes
// de que existiera esa columna. Solo toca celdas vacías, se puede repetir.
function rellenarKwhHistorico() {
  const tarifaEnergia = Config.tarifas().energiaPorKwh;
  const r = Hoja.rellenarKwhHistorico(tarifaEnergia);

  const lineas = [
    `Revisadas: ${r.revisadas} cotizaciones`,
    `✅ Rellenadas: ${r.rellenadas}`,
    `• Ya tenían kWh: ${r.yaTenian}`
  ];

  if (r.omitidas.length) {
    lineas.push("", `⚠️ Omitidas (${r.omitidas.length}):`, ...r.omitidas.slice(0, 10));
    if (r.omitidas.length > 10) lineas.push(`…y ${r.omitidas.length - 10} más`);
  }
  if (r.discrepancias.length) {
    lineas.push("", `⚠️ Para revisar (${r.discrepancias.length}):`, ...r.discrepancias.slice(0, 10));
    if (r.discrepancias.length > 10) lineas.push(`…y ${r.discrepancias.length - 10} más`);
  }

  lineas.push("", `Reconstruido como Costo energía ÷ $${tarifaEnergia}/kWh.`);
  SpreadsheetApp.getUi().alert(lineas.join("\n"));
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