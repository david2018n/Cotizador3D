// ============================================================
//  COTIZADOR 3D — Google Apps Script
//  Archivo: Code.gs
// ============================================================

const TARIFAS = {
  filamentoPorGramo: 75,
  energiaPorKwh: 770,
  mantenimientoPct: 0.05,
  multiplicadorVenta: 3.0
};

const IMPRESORAS = {
  "Ender 3 S1 Pro": { kwhCalentamiento: 0.0360, wImpresion: 152 },
  "Creality HI":    { kwhCalentamiento: 0.0288, wImpresion: 180 }
};

const ENCABEZADOS = [
  "Miniatura",
  "Nombre de la pieza",
  "Impresora",
  "Multicolor",
  "Tiempo impresión",
  "Filamento (g)",
  "Ancho (mm)",
  "Largo (mm)",
  "Alto (mm)",
  "Piezas en cama",
  "Costo filamento",
  "Costo energía",
  "Subtotal",
  "Mantenimiento (5%)",
  "Total costo (cama)",
  "Costo por unidad",
  "Precio venta por unidad",
  "Total venta (cama)",
  "Fecha"
];

// ── Menú ──────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🖨️ Cotizador 3D")
    .addItem("Importar G-code...", "mostrarDialogo")
    .addSeparator()
    .addItem("Inicializar hoja", "inicializarHoja")
    .addToUi();
}

function mostrarDialogo() {
  const html = HtmlService
    .createHtmlOutputFromFile("Dialog")
    .setWidth(540)
    .setHeight(740)
    .setTitle("Importar G-code de Creality Print");
  SpreadsheetApp.getUi().showModalDialog(html, "Importar G-code");
}

function inicializarHoja() {
  const hoja = obtenerHoja();
  if (hoja.getLastRow() === 0) {
    escribirEncabezados(hoja);
    SpreadsheetApp.getUi().alert("✅ Hoja inicializada correctamente.");
  } else {
    SpreadsheetApp.getUi().alert("La hoja ya tiene contenido. No se modificó.");
  }
}

// ── Guardar cotización ────────────────────────────────────────
function guardarCotizacion(datos) {
  try {
    const costos = calcularCostos(datos);
    const hoja   = obtenerHoja();

    if (hoja.getLastRow() === 0) escribirEncabezados(hoja);

    let imagenUrl = "";
    if (datos.thumbnailBase64) {
      imagenUrl = guardarMiniaturaEnDrive(datos.thumbnailBase64, datos.nombrePieza);
    }

    const fila = construirFila(datos, costos, imagenUrl);
    hoja.appendRow(fila);

    const ultimaFila = hoja.getLastRow();
    aplicarFormatos(hoja, ultimaFila);

    if (imagenUrl) {
      hoja.getRange(ultimaFila, 1).setFormula(`=IMAGE("${imagenUrl}";4;60;60)`);
      hoja.setRowHeight(ultimaFila, 65);
    }

    return { ok: true, mensaje: "Cotización guardada correctamente." };
  } catch (e) {
    return { ok: false, mensaje: e.message };
  }
}

// ── Guardar miniatura en Drive ────────────────────────────────
function guardarMiniaturaEnDrive(base64, nombrePieza) {
  const carpetaNombre = "Cotizador3D_Miniaturas";
  let carpeta;
  const iter = DriveApp.getFoldersByName(carpetaNombre);
  carpeta = iter.hasNext() ? iter.next() : DriveApp.createFolder(carpetaNombre);

  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64),
    "image/png",
    `${(nombrePieza || "pieza").replace(/[^a-zA-Z0-9_\-]/g, "_")}_${Date.now()}.png`
  );

  const archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/uc?export=view&id=${archivo.getId()}`;
}

// ── Cálculo de costos ─────────────────────────────────────────
function calcularCostos(datos) {
  const config = IMPRESORAS[datos.impresora];
  if (!config) throw new Error(`Impresora desconocida: ${datos.impresora}`);

  const unidades = datos.unidadesPorCama || 1;

  const kwhLabor       = (config.wImpresion / 1000) * datos.tiempoHoras;
  const kwhTotal       = config.kwhCalentamiento + kwhLabor;
  const costoFilamento = datos.filamentoGramos * TARIFAS.filamentoPorGramo;
  const costoEnergia   = kwhTotal * TARIFAS.energiaPorKwh;
  const subtotal       = costoFilamento + costoEnergia;
  const mantenimiento  = subtotal * TARIFAS.mantenimientoPct;
  const totalCama      = subtotal + mantenimiento;
  const costoUnidad    = totalCama / unidades;
  const precioUnidad   = costoUnidad * TARIFAS.multiplicadorVenta;

  const totalVenta = precioUnidad * unidades;

  return {
    costoFilamento: Math.round(costoFilamento),
    costoEnergia:   Math.round(costoEnergia),
    subtotal:       Math.round(subtotal),
    mantenimiento:  Math.round(mantenimiento),
    totalCama:      Math.round(totalCama),
    costoUnidad:    Math.round(costoUnidad),
    precioUnidad:   Math.round(precioUnidad),
    totalVenta:     Math.round(totalVenta)
  };
}

// ── Construir fila ────────────────────────────────────────────
function construirFila(datos, costos, imagenUrl) {
  return [
    imagenUrl ? "" : "(sin imagen)",
    datos.nombrePieza      || "(sin nombre)",
    datos.impresora,
    datos.multicolor       ? "Sí 🎨" : "No",
    formatearTiempo(datos.tiempoHoras),
    datos.filamentoGramos,
    datos.anchoMm          || "",
    datos.largoMm          || "",
    datos.altoMm           || "",
    datos.unidadesPorCama  || 1,
    costos.costoFilamento,
    costos.costoEnergia,
    costos.subtotal,
    costos.mantenimiento,
    costos.totalCama,
    costos.costoUnidad,
    costos.precioUnidad,
    costos.totalVenta,
    new Date()
  ];
}

// ── Helpers ───────────────────────────────────────────────────
function obtenerHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName("Cotizaciones") || ss.insertSheet("Cotizaciones");
}

function escribirEncabezados(hoja) {
  const rango = hoja.getRange(1, 1, 1, ENCABEZADOS.length);
  rango.setValues([ENCABEZADOS]);
  rango.setFontWeight("bold");
  rango.setBackground("#1a1a2e");
  rango.setFontColor("#ffffff");
  hoja.setFrozenRows(1);
  hoja.setColumnWidth(1, 80);

  // Destacar columnas de precio por unidad y total venta (cols 17-18)
  hoja.getRange(1, 17, 1, 2).setBackground("#155724").setFontColor("#ffffff");
}

function aplicarFormatos(hoja, fila) {
  // Formato moneda: columnas 11–18 (se corrió por Multicolor en col 4)
  [11, 12, 13, 14, 15, 16, 17, 18].forEach(col => {
    hoja.getRange(fila, col).setNumberFormat('"$"#,##0');
  });
  // Destacar precio por unidad y total venta
  hoja.getRange(fila, 17, 1, 2).setBackground("#e8f5e9").setFontWeight("bold");
}

function formatearTiempo(horas) {
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}