// ============================================================
//  Hoja.gs — Operaciones sobre Google Sheets
// ============================================================

const Hoja = (() => {

  const NOMBRES = {
    cotizaciones: "Cotizaciones",
    insumos:      "Insumos",
    detalle:      "Cotizaciones_Insumos"
  };

  const ENC_COTIZACIONES = [
    "ID",
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
    "Costo impresión/u",
    "Insumos/u",
    "Costo total/u",
    "Precio venta/u",
    "Total venta (cama)",
    "Fecha"
  ];

  const ENC_INSUMOS = ["ID", "Nombre", "Precio unitario"];

  const ENC_DETALLE = [
    "ID cotización",
    "ID insumo",
    "Nombre insumo",
    "Precio/u",
    "Unidades",
    "Total"
  ];

  // Columnas moneda en Cotizaciones (base 1)
  const COLS_MONEDA_COT   = [12, 13, 14, 15, 16, 17, 18, 19, 20];
  const COLS_DESTACADAS   = [19, 20]; // Precio venta/u y Total venta (cama)

  // ── Inicialización ────────────────────────────────────────

  function inicializar() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    _inicializarHoja(ss, NOMBRES.cotizaciones, ENC_COTIZACIONES, _formatearEncCotizaciones);
    _inicializarHoja(ss, NOMBRES.insumos,      ENC_INSUMOS,      _formatearEncSimple);
    _inicializarHoja(ss, NOMBRES.detalle,      ENC_DETALLE,      _formatearEncSimple);
  }

  function _inicializarHoja(ss, nombre, encabezados, formatFn) {
    const hoja = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    if (hoja.getLastRow() === 0) {
      const rango = hoja.getRange(1, 1, 1, encabezados.length);
      rango.setValues([encabezados]);
      formatFn(hoja, rango, encabezados.length);
      hoja.setFrozenRows(1);
    }
    return hoja;
  }

  function _formatearEncCotizaciones(hoja, rango) {
    rango.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
    hoja.setColumnWidth(2, 80);
    // Destacar columnas Total real
    hoja.getRange(1, COLS_DESTACADAS[0], 1, 2)
        .setBackground("#155724").setFontColor("#ffffff");
  }

  function _formatearEncSimple(hoja, rango) {
    rango.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
  }

  // ── IDs ───────────────────────────────────────────────────

  function siguienteId() {
    const hoja = _obtener(NOMBRES.cotizaciones);
    const ultima = hoja.getLastRow();
    if (ultima <= 1) return 1;
    const ids = hoja.getRange(2, 1, ultima - 1, 1).getValues()
      .map(r => parseInt(r[0]) || 0);
    return Math.max(...ids) + 1;
  }

  function _siguienteIdInsumo() {
    const hoja = _obtener(NOMBRES.insumos);
    const ultima = hoja.getLastRow();
    if (ultima <= 1) return 1;
    const ids = hoja.getRange(2, 1, ultima - 1, 1).getValues()
      .map(r => parseInt(r[0]) || 0);
    return Math.max(...ids) + 1;
  }

  // ── Catálogo de insumos ───────────────────────────────────

  function leerCatalogoInsumos() {
    const hoja = _obtener(NOMBRES.insumos);
    const ultima = hoja.getLastRow();
    if (ultima <= 1) return [];
    return hoja.getRange(2, 1, ultima - 1, 3).getValues()
      .filter(r => r[0] && r[1])
      .map(r => ({ id: r[0], nombre: r[1], precioUnidad: r[2] }));
  }

  // Busca insumo por nombre (case-insensitive), lo crea o actualiza
  // Devuelve el insumo con su ID y precio definitivo
  function procesarInsumos(insumos) {
    const hoja    = _obtener(NOMBRES.insumos);
    const catalogo = leerCatalogoInsumos();

    return insumos.map(insumo => {
      const nombre = insumo.nombre.trim();
      const precio = parseFloat(insumo.precioUnidad) || 0;
      const existente = catalogo.find(
        c => c.nombre.toLowerCase() === nombre.toLowerCase()
      );

      if (existente) {
        // Actualizar precio si cambió
        if (existente.precioUnidad !== precio) {
          const fila = _encontrarFilaInsumo(hoja, existente.id);
          if (fila > 0) hoja.getRange(fila, 3).setValue(precio);
        }
        return { id: existente.id, nombre, precioUnidad: precio };
      } else {
        // Crear nuevo insumo en catálogo
        const nuevoId = _siguienteIdInsumo();
        hoja.appendRow([nuevoId, nombre, precio]);
        catalogo.push({ id: nuevoId, nombre, precioUnidad: precio });
        return { id: nuevoId, nombre, precioUnidad: precio };
      }
    });
  }

  function _encontrarFilaInsumo(hoja, id) {
    const ultima = hoja.getLastRow();
    if (ultima <= 1) return -1;
    const ids = hoja.getRange(2, 1, ultima - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (parseInt(ids[i][0]) === parseInt(id)) return i + 2;
    }
    return -1;
  }

  // ── Escritura de cotizaciones ─────────────────────────────

  function agregarFilaCotizacion(id, datos, costos, imagenUrl) {
    const hoja = _obtener(NOMBRES.cotizaciones);
    if (hoja.getLastRow() === 0) inicializar();

    const fila = _construirFilaCotizacion(id, datos, costos, imagenUrl);
    hoja.appendRow(fila);

    const ultimaFila = hoja.getLastRow();
    _aplicarFormatosCotizacion(hoja, ultimaFila, imagenUrl);
  }

  function _construirFilaCotizacion(id, datos, costos, imagenUrl) {
    return [
      id,
      imagenUrl ? "" : "(sin imagen)",
      datos.nombrePieza     || "(sin nombre)",
      datos.impresora,
      datos.multicolor      ? "Sí 🎨" : "No",
      _formatearTiempo(datos.tiempoHoras),
      datos.filamentoGramos,
      datos.anchoMm         || "",
      datos.largoMm         || "",
      datos.altoMm          || "",
      datos.unidadesPorCama || 1,
      costos.costoFilamento,
      costos.costoEnergia,
      costos.subtotal,
      costos.mantenimiento,
      costos.totalCama,
      costos.costoImpresionUnidad,
      costos.insumosUnidad,
      costos.costoTotalUnidad,
      costos.precioUnidad,
      costos.totalVenta,
      new Date()
    ];
  }

  function _aplicarFormatosCotizacion(hoja, fila, imagenUrl) {
    COLS_MONEDA_COT.forEach(col =>
      hoja.getRange(fila, col).setNumberFormat('"$"#,##0')
    );
    hoja.getRange(fila, COLS_DESTACADAS[0], 1, 2)
        .setBackground("#e8f5e9").setFontWeight("bold");

    if (imagenUrl) {
      hoja.getRange(fila, 2).setFormula(`=IMAGE("${imagenUrl}";4;60;60)`);
      hoja.setRowHeight(fila, 65);
    }
  }

  // ── Escritura de detalle de insumos ───────────────────────

  function agregarFilasInsumos(idCotizacion, insumos, unidades) {
    const hoja = _obtener(NOMBRES.detalle);
    if (hoja.getLastRow() === 0) inicializar();

    insumos.forEach(insumo => {
      const total = insumo.precioUnidad * unidades;
      hoja.appendRow([
        idCotizacion,
        insumo.id,
        insumo.nombre,
        insumo.precioUnidad,
        unidades,
        total
      ]);
      const fila = hoja.getLastRow();
      hoja.getRange(fila, 4).setNumberFormat('"$"#,##0');
      hoja.getRange(fila, 6).setNumberFormat('"$"#,##0');
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  function _obtener(nombre) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  }

  function _formatearTiempo(horas) {
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }

  return {
    inicializar,
    siguienteId,
    leerCatalogoInsumos,
    procesarInsumos,
    agregarFilaCotizacion,
    agregarFilasInsumos
  };

})();