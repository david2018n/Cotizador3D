// ============================================================
//  Hoja.gs — Operaciones sobre Google Sheets
// ============================================================

const Hoja = (() => {

  const NOMBRES = {
    cotizaciones: "Cotizaciones",
    insumos:      "Insumos",
    detalle:      "Cotizaciones_Insumos"
  };

  // El encabezado de mantenimiento no lleva el porcentaje: es configurable
  // en la hoja "Parámetros" y quedaría desactualizado al cambiarlo.
  const COL_KWH = "kWh total";

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
    COL_KWH,
    "Costo filamento",
    "Costo energía",
    "Subtotal",
    "Mantenimiento",
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

  // Posiciones en Cotizaciones (base 1), derivadas del encabezado para que
  // no se desfasen al agregar o mover columnas.
  const COL = nombre => ENC_COTIZACIONES.indexOf(nombre) + 1;

  const COL_MINIATURA = COL("Miniatura");
  const COL_KWH_NUM   = COL(COL_KWH);
  // Todo el bloque de dinero, de "Costo filamento" a "Total venta (cama)"
  const COLS_MONEDA_COT = (() => {
    const desde = COL("Costo filamento"), hasta = COL("Total venta (cama)");
    return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  })();
  const COLS_DESTACADAS = [COL("Precio venta/u"), COL("Total venta (cama)")];

  // ── Inicialización ────────────────────────────────────────

  function inicializar() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cot = _inicializarHoja(ss, NOMBRES.cotizaciones, ENC_COTIZACIONES, _formatearEncCotizaciones);
    _migrarCotizaciones(cot);
    _inicializarHoja(ss, NOMBRES.insumos,      ENC_INSUMOS,      _formatearEncSimple);
    _inicializarHoja(ss, NOMBRES.detalle,      ENC_DETALLE,      _formatearEncSimple);
  }

  /**
   * Migración del esquema de Cotizaciones: inserta la columna "kWh total" en
   * las hojas creadas antes de que existiera y normaliza el encabezado.
   *
   * Es idempotente y no destructiva: insertColumnBefore desplaza las celdas,
   * así que las cotizaciones históricas conservan todos sus valores y solo
   * quedan con la celda de kWh vacía. Si el encabezado no es el layout previo
   * conocido, lanza en vez de escribir: es preferible que el guardado falle a
   * que los datos se escriban en columnas equivocadas.
   */
  function _migrarCotizaciones(hoja) {
    const ancho = hoja.getLastColumn();
    if (ancho === 0) return;                                   // hoja recién creada

    const encabezados = hoja.getRange(1, 1, 1, ancho).getValues()[0]
      .map(v => String(v).trim());
    if (encabezados.indexOf(COL_KWH) !== -1) return;            // ya migrada

    const anchoPrevio = ENC_COTIZACIONES.length - 1;            // layout sin kWh
    if (ancho !== anchoPrevio) {
      throw new Error(
        `La hoja "${NOMBRES.cotizaciones}" tiene ${ancho} columnas y no se reconoce ` +
        `como el esquema anterior (${anchoPrevio}) ni como el actual ` +
        `(${ENC_COTIZACIONES.length}). Se detiene para no escribir en columnas ` +
        `equivocadas: revísala a mano y agrega la columna "${COL_KWH}" en la ` +
        `posición ${COL_KWH_NUM}.`
      );
    }

    hoja.insertColumnBefore(COL_KWH_NUM);
    const rango = hoja.getRange(1, 1, 1, ENC_COTIZACIONES.length);
    rango.setValues([ENC_COTIZACIONES]);
    _formatearEncCotizaciones(hoja, rango);
    hoja.setFrozenRows(1);

    console.warn(
      `Hoja "${NOMBRES.cotizaciones}" migrada: columna "${COL_KWH}" insertada en la ` +
      `posición ${COL_KWH_NUM} y encabezado normalizado. Las cotizaciones anteriores ` +
      `quedan con esa celda vacía (el kWh es recalculable desde Impresora y Tiempo).`
    );
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
    hoja.setColumnWidth(COL_MINIATURA, 80);
    // Destacar Precio venta/u y Total venta (cama)
    hoja.getRange(1, COLS_DESTACADAS[0], 1, COLS_DESTACADAS.length)
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
    else _migrarCotizaciones(hoja);   // hojas creadas antes de la columna de kWh

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
      costos.kwhTotal,
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
    // 4 decimales: el spec los pide para poder auditar el cálculo de energía
    hoja.getRange(fila, COL_KWH_NUM).setNumberFormat("0.0000");
    COLS_MONEDA_COT.forEach(col =>
      hoja.getRange(fila, col).setNumberFormat('"$"#,##0')
    );
    hoja.getRange(fila, COLS_DESTACADAS[0], 1, COLS_DESTACADAS.length)
        .setBackground("#e8f5e9").setFontWeight("bold");

    if (imagenUrl) {
      hoja.getRange(fila, COL_MINIATURA).setFormula(`=IMAGE("${imagenUrl}";4;60;60)`);
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

  // ── Búsqueda de referencias ───────────────────────────────

  /**
   * Devuelve todo el texto del libro —fórmulas y valores visibles de todas las
   * hojas— en un solo string, para poder preguntar si algo sigue referenciado
   * en alguna parte.
   *
   * Se incluyen las fórmulas porque las miniaturas viven dentro de
   * `=IMAGE("…")`, cuyo valor visible está vacío; y los valores visibles porque
   * un enlace también puede estar pegado como texto en cualquier celda.
   */
  function textoDelLibro() {
    const partes = [];
    SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(hoja => {
      if (hoja.getLastRow() === 0) return;
      const rango = hoja.getDataRange();
      partes.push(rango.getFormulas().map(fila => fila.join("\n")).join("\n"));
      partes.push(rango.getDisplayValues().map(fila => fila.join("\n")).join("\n"));
    });
    return partes.join("\n");
  }

  // ── Helpers ───────────────────────────────────────────────

  function _obtener(nombre) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  }

  // Se redondea a minutos antes de partir, o 41,999 h saldría como "41h 60m"
  function _formatearTiempo(horas) {
    const totalMin = Math.round(horas * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }

  return {
    inicializar,
    siguienteId,
    leerCatalogoInsumos,
    procesarInsumos,
    agregarFilaCotizacion,
    agregarFilasInsumos,
    textoDelLibro
  };

})();