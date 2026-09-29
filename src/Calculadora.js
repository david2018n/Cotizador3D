// ============================================================
//  Calculadora.gs — Lógica de negocio: cálculo de costos
// ============================================================

const Calculadora = (() => {

  const TARIFAS = {
    filamentoPorGramo:  80,
    energiaPorKwh:      770,
    mantenimientoPct:   0.05,
    multiplicadorVenta: 3.0
  };

  const IMPRESORAS = {
    "Ender 3 S1 Pro": { kwhCalentamiento: 0.0360, wImpresion: 152 },
    "Creality HI":    { kwhCalentamiento: 0.0288, wImpresion: 180 }
  };

  function calcular(datos) {
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
    const costoImpresionUnidad = totalCama / unidades;
    const insumosUnidad        = _calcularInsumosUnidad(datos.insumos || []);
    const costoTotalUnidad     = costoImpresionUnidad + insumosUnidad;
    const precioUnidad         = costoTotalUnidad * TARIFAS.multiplicadorVenta;
    const totalVenta           = precioUnidad * unidades;

    return {
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

  return { calcular, TARIFAS, IMPRESORAS };

})();