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

  // La única columna que la app no escribe: el precio al que de verdad se
  // vendió, cuando se acordó otro distinto al sugerido. Nace vacía a propósito,
  // para que un valor ahí signifique siempre una decisión tomada.
  const COL_REAL = "Precio real/u";
  const NOTA_REAL =
    "Se llena a mano.\n\n" +
    "El precio al que realmente vendiste la unidad, cuando no es el sugerido: " +
    "por acuerdo con el cliente, o porque la pieza vale más en el mercado.\n\n" +
    "Vacío = todavía no hay un precio acordado.";

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
    COL_REAL,
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

  // Encabezados que en su día se llamaron de otra forma. La migración los
  // traduce antes de comparar, para que una hoja vieja —o restaurada del
  // historial de versiones— se reconozca igual. Cada renombrado futuro añade
  // una entrada aquí.
  const RENOMBRES = {
    "Hola": "ID",                                 // dedazo en A1 de la hoja original
    "Mantenimiento (5%)": "Mantenimiento"          // el % pasó a ser configurable
  };

  // Columnas que ha tenido toda versión del esquema. Si a una hoja llamada
  // "Cotizaciones" le falta alguna, no es una versión anterior de la nuestra
  // —será de otra cosa— y la migración no la toca.
  const NUCLEO = [
    "ID", "Nombre de la pieza", "Impresora", "Filamento (g)",
    "Costo filamento", "Precio venta/u", "Total venta (cama)", "Fecha"
  ];

  // Posiciones en Cotizaciones (base 1), derivadas del encabezado para que
  // no se desfasen al agregar o mover columnas.
  const COL = nombre => ENC_COTIZACIONES.indexOf(nombre) + 1;

  const COL_MINIATURA  = COL("Miniatura");
  const COL_KWH_NUM    = COL(COL_KWH);
  const COL_REAL_NUM   = COL(COL_REAL);
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
   * Migración del esquema de Cotizaciones: compara el encabezado real con
   * ENC_COTIZACIONES e inserta las columnas que falten, cada una en su
   * posición. Genérica a propósito: cada vez que el esquema gane una columna,
   * las hojas existentes se ponen al día solas, sin añadir un caso más aquí.
   *
   * Idempotente y no destructiva. `insertColumnBefore` desplaza las celdas, así
   * que las cotizaciones históricas conservan todos sus valores y solo quedan
   * con la celda nueva vacía. Las columnas que el usuario haya añadido al final
   * se conservan, desplazadas.
   *
   * Primero simula el resultado y lo valida; solo si el encabezado proyectado
   * cuadra con el esquema toca la hoja. Si no cuadra lanza sin haber escrito
   * nada: es preferible que falle el guardado a que los datos caigan en
   * columnas equivocadas.
   */
  function _migrarCotizaciones(hoja) {
    const ancho = hoja.getLastColumn();
    if (ancho === 0) return;                          // hoja recién creada

    const crudos = hoja.getRange(1, 1, 1, ancho).getValues()[0].map(v => String(v).trim());
    const actuales = crudos.map(h => RENOMBRES[h] || h);
    const renombrados = crudos.filter(h => RENOMBRES[h] !== undefined);

    const faltantes = ENC_COTIZACIONES.filter(h => actuales.indexOf(h) === -1);
    if (!faltantes.length && !renombrados.length) return;   // ya está al día

    const sinNucleo = NUCLEO.filter(h => actuales.indexOf(h) === -1);
    if (sinNucleo.length) {
      throw new Error(
        `La hoja "${NOMBRES.cotizaciones}" no parece una versión anterior de las ` +
        `cotizaciones: le faltan columnas que todas han tenido (${sinNucleo.join(", ")}). ` +
        `No se toca. Si de verdad es la hoja de cotizaciones, renómbrala o revisa la fila 1.`
      );
    }

    // Simulación: mismas inserciones, sobre una copia del encabezado
    const proyectado = actuales.slice();
    faltantes.forEach(nombre => proyectado.splice(ENC_COTIZACIONES.indexOf(nombre), 0, nombre));

    const desalineada = ENC_COTIZACIONES.findIndex((h, i) => proyectado[i] !== h);
    if (desalineada !== -1) {
      throw new Error(
        `No se reconoce el encabezado de la hoja "${NOMBRES.cotizaciones}": tras ` +
        `insertar las columnas que faltan (${faltantes.join(", ")}), la posición ` +
        `${desalineada + 1} tendría "${proyectado[desalineada]}" en vez de ` +
        `"${ENC_COTIZACIONES[desalineada]}". Se detiene sin escribir nada para no ` +
        `volcar datos en columnas equivocadas. Revisa la fila 1: el esquema esperado ` +
        `es ${ENC_COTIZACIONES.join(" | ")}.`
      );
    }

    faltantes.forEach(nombre => hoja.insertColumnBefore(ENC_COTIZACIONES.indexOf(nombre) + 1));

    // Reescribir la fila 1 completa deja también los renombrados al día
    const rango = hoja.getRange(1, 1, 1, ENC_COTIZACIONES.length);
    rango.setValues([ENC_COTIZACIONES]);
    _formatearEncCotizaciones(hoja, rango);
    hoja.setFrozenRows(1);

    const partes = [];
    if (faltantes.length)   partes.push(`insertadas ${faltantes.length} columna(s): ${faltantes.join(", ")}`);
    if (renombrados.length) partes.push(`renombradas ${renombrados.length}: ${renombrados.join(", ")}`);
    console.warn(
      `Hoja "${NOMBRES.cotizaciones}" migrada — ${partes.join("; ")}. Las cotizaciones ` +
      `anteriores conservan sus valores y quedan con las celdas nuevas vacías.`
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
    // Verde: los dos totales sugeridos por el cálculo
    COLS_DESTACADAS.forEach(col =>
      hoja.getRange(1, col).setBackground("#155724").setFontColor("#ffffff")
    );
    // Ámbar: la única columna que se llena a mano, con su nota explicativa
    hoja.getRange(1, COL_REAL_NUM)
        .setBackground("#7f6000").setFontColor("#ffffff")
        .setNote(NOTA_REAL);
    hoja.setColumnWidth(COL_REAL_NUM, 110);
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
      "",                       // Precio real/u: lo llena el usuario
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
    COLS_DESTACADAS.forEach(col =>
      hoja.getRange(fila, col).setBackground("#e8f5e9").setFontWeight("bold")
    );
    // Se deja marcada aunque esté vacía, para que se vea que espera un valor
    hoja.getRange(fila, COL_REAL_NUM).setBackground("#fff8e1");

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