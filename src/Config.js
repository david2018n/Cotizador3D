// ============================================================
//  Config.gs — Parámetros de negocio editables desde la hoja
// ============================================================
//  Las tarifas viven en la hoja "Parámetros" y son la única fuente
//  de verdad en tiempo de ejecución, tanto para el cálculo del
//  servidor (Calculadora) como para el preview del diálogo.
//  DEFECTOS de este archivo solo se usa para sembrar la hoja y como
//  red de seguridad si un valor falta o no es válido.
// ============================================================

const Config = (() => {

  const HOJA = "Parámetros";
  const ENCABEZADOS = ["Clave", "Descripción", "Valor", "Unidad"];
  const COL = { clave: 1, descripcion: 2, valor: 3, unidad: 4 };

  const DEFECTOS = [
    {
      clave: "filamentoPorGramo",
      descripcion: "Costo del filamento por gramo",
      valor: 80,
      unidad: "$/g",
      formato: '"$"#,##0.00'
    },
    {
      clave: "energiaPorKwh",
      descripcion: "Costo de la energía por kWh",
      valor: 770,
      unidad: "$/kWh",
      formato: '"$"#,##0.00'
    },
    {
      clave: "mantenimientoPct",
      descripcion: "Mantenimiento, como porcentaje del subtotal",
      valor: 0.05,
      unidad: "% del subtotal",
      formato: "0.0%"
    },
    {
      clave: "multiplicadorVenta",
      descripcion: "Multiplicador del precio de venta (3 = costo × 3)",
      valor: 3,
      unidad: "× sobre el costo",
      formato: "0.00"
    }
  ];

  // ── API ───────────────────────────────────────────────────

  /**
   * Crea la hoja "Parámetros" si falta y agrega las filas de los
   * parámetros que aún no estén. Idempotente y aditiva: nunca
   * sobrescribe un valor que ya escribió el usuario, así que se puede
   * llamar en cada ejecución sin miedo.
   */
  function inicializar() {
    const hoja = _obtenerHoja();
    const existentes = _leerCrudo(hoja);
    const faltantes = DEFECTOS.filter(d => !(d.clave in existentes));

    faltantes.forEach(d => {
      hoja.appendRow([d.clave, d.descripcion, d.valor, d.unidad]);
      hoja.getRange(hoja.getLastRow(), COL.valor).setNumberFormat(d.formato);
    });

    if (faltantes.length > 0) _ajustarAnchos(hoja);
    return hoja;
  }

  /**
   * Tarifas efectivas: { filamentoPorGramo, energiaPorKwh,
   * mantenimientoPct, multiplicadorVenta }. Lee la hoja y cae al valor
   * por defecto en cada clave que falte o no sea un número válido.
   */
  function tarifas() {
    const crudo = _leerCrudo(inicializar());
    return DEFECTOS.reduce((acc, d) => {
      acc[d.clave] = _numeroValido(crudo[d.clave], d);
      return acc;
    }, {});
  }

  /**
   * Lo mismo que tarifas(), pero como lista con descripción y unidad,
   * para que el diálogo pueda mostrar qué valores está aplicando.
   */
  function tarifasConMetadatos() {
    const valores = tarifas();
    return DEFECTOS.map(d => ({
      clave: d.clave,
      descripcion: d.descripcion,
      unidad: d.unidad,
      valor: valores[d.clave]
    }));
  }

  // ── Internos ──────────────────────────────────────────────

  function _obtenerHoja() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const existente = ss.getSheetByName(HOJA);
    if (existente) return existente;

    const hoja = ss.insertSheet(HOJA);
    const rango = hoja.getRange(1, 1, 1, ENCABEZADOS.length);
    rango.setValues([ENCABEZADOS]);
    rango.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
    hoja.setFrozenRows(1);
    // Resaltar que "Valor" es la única columna pensada para editar
    hoja.getRange(1, COL.valor).setBackground("#155724");
    return hoja;
  }

  function _leerCrudo(hoja) {
    const ultima = hoja.getLastRow();
    if (ultima <= 1) return {};
    return hoja.getRange(2, 1, ultima - 1, ENCABEZADOS.length).getValues()
      .reduce((acc, fila) => {
        const clave = String(fila[COL.clave - 1]).trim();
        if (clave) acc[clave] = fila[COL.valor - 1];
        return acc;
      }, {});
  }

  function _numeroValido(bruto, defecto) {
    if (bruto === undefined || bruto === null || bruto === "") return defecto.valor;
    const num = typeof bruto === "number"
      ? bruto
      : parseFloat(String(bruto).replace(",", "."));

    if (!isFinite(num) || num < 0) {
      console.warn(
        `Parámetro "${defecto.clave}" inválido en la hoja "${HOJA}" ` +
        `(valor leído: "${bruto}"). Se usa el valor por defecto: ${defecto.valor}.`
      );
      return defecto.valor;
    }
    return num;
  }

  function _ajustarAnchos(hoja) {
    hoja.setColumnWidth(COL.clave, 170);
    hoja.setColumnWidth(COL.descripcion, 310);
    hoja.setColumnWidth(COL.valor, 100);
    hoja.setColumnWidth(COL.unidad, 130);
  }

  return { HOJA, DEFECTOS, inicializar, tarifas, tarifasConMetadatos };

})();
