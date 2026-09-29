// ============================================================
//  Calculadora.gs — Lógica de negocio: cálculo de costos
// ============================================================

const Calculadora = (() => {

  const IMPRESORAS = {
    "Ender 3 S1 Pro": { kwhCalentamiento: 0.0360, wImpresion: 152 },
    "Creality HI":    { kwhCalentamiento: 0.0288, wImpresion: 180 }
  };

  /**
   * Energía total de una impresión: el calentamiento, que no está incluido en
   * el tiempo que reporta el laminador, más el consumo durante la impresión.
   */
  function kwh(impresora, tiempoHoras) {
    const config = IMPRESORAS[impresora];
    if (!config) throw new Error(`Impresora desconocida: ${impresora}`);
    return config.kwhCalentamiento + (config.wImpresion / 1000) * tiempoHoras;
  }

  /**
   * @param datos    Datos de la pieza enviados por el diálogo.
   * @param tarifas  Tarifas de Config.tarifas(). Si se omite, se leen de la
   *                 hoja "Parámetros" (útil al llamar desde el editor).
   */
  function calcular(datos, tarifas) {
    const TARIFAS = tarifas || Config.tarifas();

    const unidades = datos.unidadesPorCama || 1;
    const kwhTotal = kwh(datos.impresora, datos.tiempoHoras);
    const costoFilamento = datos.filamentoGramos * TARIFAS.filamentoPorGramo;
    const costoEnergia   = kwhTotal * TARIFAS.energiaPorKwh;
    const subtotal       = costoFilamento + costoEnergia;
    const mantenimiento  = subtotal * TARIFAS.mantenimientoPct;
    const totalCama      = subtotal + mantenimiento;
    const costoImpresionUnidad = totalCama / unidades;
    const insumosUnidad        = _calcularInsumosUnidad(datos.insumos || []);
    const costoTotalUnidad     = costoImpresionUnidad + insumosUnidad;
    const precioUnidad         = costoTotalUnidad * TARIFAS.multiplicadorVenta;
    const totalVenta           = precioUnidad * unidades;

    return {
      // Sin redondear: la hoja lo muestra con 4 decimales para auditar la energía
      kwhTotal:             kwhTotal,
      costoFilamento:       Math.round(costoFilamento),
      costoEnergia:         Math.round(costoEnergia),
      subtotal:             Math.round(subtotal),
      mantenimiento:        Math.round(mantenimiento),
      totalCama:            Math.round(totalCama),
      costoImpresionUnidad: Math.round(costoImpresionUnidad),
      insumosUnidad:        Math.round(insumosUnidad),
      costoTotalUnidad:     Math.round(costoTotalUnidad),
      precioUnidad:         Math.round(precioUnidad),
      totalVenta:           Math.round(totalVenta)
    };
  }

  function _calcularInsumosUnidad(insumos) {
    return insumos.reduce((suma, i) => suma + (parseFloat(i.precioUnidad) || 0), 0);
  }

  return { calcular, kwh, IMPRESORAS };

})();