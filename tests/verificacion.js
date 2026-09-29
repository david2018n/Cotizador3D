// ============================================================
//  Verificación: spec ↔ servidor ↔ cliente, y migración de la hoja
// ============================================================
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const SRC = path.join(RAIZ, 'src');

// ── Hoja falsa con rejilla 2D ─────────────────────────────────
function crearHoja(nombre) {
  const g = [];                                  // g[fila][col], base 0
  const fmt = {}, fondo = {}, notas = {};
  const celda = (f, c) => {
    while (g.length < f) g.push([]);
    return g[f - 1];
  };
  const hoja = {
    nombre,
    getLastRow: () => g.reduce((max, fila, i) => fila.some(v => v !== '' && v !== undefined) ? i + 1 : max, 0),
    getLastColumn: () => g.reduce((max, fila) => Math.max(max, fila.length), 0),
    appendRow(vals) { g.push(vals.slice()); },
    insertColumnBefore(n) { g.forEach(fila => { if (fila.length >= n) fila.splice(n - 1, 0, ''); }); },
    getRange(f, c, nf = 1, nc = 1) {
      const api = {
        setValues(vals) {
          vals.forEach((fv, i) => { const fila = celda(f + i, c); fv.forEach((v, j) => (fila[c - 1 + j] = v)); });
          return api;
        },
        getValues() {
          const out = [];
          for (let i = 0; i < nf; i++) {
            const fila = g[f - 1 + i] || [], row = [];
            for (let j = 0; j < nc; j++) row.push(fila[c - 1 + j] === undefined ? '' : fila[c - 1 + j]);
            out.push(row);
          }
          return out;
        },
        setValue(v) { celda(f, c)[c - 1] = v; return api; },
        setFormula(v) { celda(f, c)[c - 1] = v; return api; },
        setNumberFormat(v) { for (let j = 0; j < nc; j++) fmt[`${f},${c + j}`] = v; return api; },
        setBackground(v) { for (let j = 0; j < nc; j++) fondo[`${f},${c + j}`] = v; return api; },
        setFontWeight: () => api, setFontColor: () => api,
        setNote(v) { notas[`${f},${c}`] = v; return api; },
        esFormula: v => typeof v === 'string' && v.charAt(0) === '=',
        getFormulas() { return api.getValues().map(fl => fl.map(v => api.esFormula(v) ? v : '')); },
        getDisplayValues() { return api.getValues().map(fl => fl.map(v => api.esFormula(v) ? '' : String(v === undefined ? '' : v))); },
      };
      return api;
    },
    getDataRange() { return hoja.getRange(1, 1, Math.max(hoja.getLastRow(), 1), Math.max(hoja.getLastColumn(), 1)); },
    setFrozenRows: () => hoja, setColumnWidth: () => hoja, setRowHeight: () => hoja,
    _g: g, _fmt: fmt, _fondo: fondo, _notas: notas,
  };
  return hoja;
}
const crearSS = (hojas = {}) => ({
  getSheetByName: n => hojas[n] || null,
  insertSheet: n => (hojas[n] = crearHoja(n)),
  getSheets: () => Object.keys(hojas).map(n => hojas[n]),
  _hojas: hojas,
});

// ── DriveApp falso ────────────────────────────────────────────
function crearDriveApp(carpetas = {}) {
  const archivoApi = a => ({
    getId: () => a.id,
    getName: () => a.nombre,
    getMimeType: () => a.tipo || 'image/png',
    isTrashed: () => !!a.papelera,
    setTrashed(v) { if (a.fallar) throw new Error('No tienes permiso'); a.papelera = v; return this; },
    setSharing() { return this; },
  });
  const carpetaApi = archivos => ({
    getFiles() { let i = 0; return { hasNext: () => i < archivos.length, next: () => archivoApi(archivos[i++]) }; },
    createFile: () => { throw new Error('no usado en estas pruebas'); },
  });
  return {
    getFoldersByName(n) {
      let dado = false;
      return { hasNext: () => !!carpetas[n] && !dado, next: () => { dado = true; return carpetaApi(carpetas[n]); } };
    },
    createFolder(n) { carpetas[n] = []; return carpetaApi(carpetas[n]); },
    getFileById(id) {
      for (const n of Object.keys(carpetas)) {
        const f = carpetas[n].find(x => x.id === id);
        if (f) return archivoApi(f);
      }
      throw new Error(`No existe el archivo ${id}`);
    },
    Access: { ANYONE_WITH_LINK: 'link' },
    Permission: { VIEW: 'view' },
    _carpetas: carpetas,
  };
}

function cargar(ss, avisos = [], driveApp = crearDriveApp()) {
  const codigo = ['Config.js', 'Calculadora.js', 'Hoja.js', 'Drive.js']
    .map(f => fs.readFileSync(`${SRC}/${f}`, 'utf8')).join('\n');
  return new Function('SpreadsheetApp', 'console', 'DriveApp',
    codigo + '\nreturn { Config, Calculadora, Hoja, Drive };'
  )({ getActiveSpreadsheet: () => ss }, { warn: m => avisos.push(m), log: () => {} }, driveApp);
}

// ── SPEC independiente ────────────────────────────────────────
const SPEC_IMP = {
  'Ender 3 S1 Pro': { kwhCal: 0.0360, w: 152 },
  'Creality HI':    { kwhCal: 0.0288, w: 180 },
};
function spec(imp, horas, gramos, unidades = 1, insumos = 0) {
  const m = SPEC_IMP[imp];
  const kwhTotal = m.kwhCal + (m.w / 1000) * horas;
  const filamento = (gramos / 1000) * 80000;
  const energia = kwhTotal * 770;
  const subtotal = filamento + energia;
  const mant = subtotal * 0.05;
  const total = subtotal + mant;
  const costoU = total / unidades + insumos;
  const precioU = costoU * 3;
  return {
    kwhTotal,
    costoFilamento: Math.round(filamento), costoEnergia: Math.round(energia),
    subtotal: Math.round(subtotal), mantenimiento: Math.round(mant),
    totalCama: Math.round(total), costoImpresionUnidad: Math.round(total / unidades),
    costoTotalUnidad: Math.round(costoU), precioUnidad: Math.round(precioU),
    totalVenta: Math.round(precioU * unidades),
  };
}

// ── CLIENTE: transcripción de la cadena NUEVA de Script.html ──
const CONSUMO = {
  'Ender 3 S1 Pro': { kwhCalor: 0.0360, wImpresion: 152 },
  'Creality HI':    { kwhCalor: 0.0288, wImpresion: 180 },
};
const T = { filamentoPorGramo: 80, energiaPorKwh: 770, mantenimientoPct: 0.05, multiplicadorVenta: 3 };
function cliente(imp, horas, gramos, unidades, insumos) {
  const cfg = CONSUMO[imp];
  const kwh = cfg.kwhCalor + (cfg.wImpresion / 1000) * horas;
  const cFil = gramos * T.filamentoPorGramo;
  const cEn = kwh * T.energiaPorKwh;
  const sub = cFil + cEn;
  const mant = sub * T.mantenimientoPct;
  const totalCama = sub + mant;
  const cImpresionU = totalCama / unidades;
  const insumosU = insumos.reduce((s, i) => s + i.precioUnidad, 0);
  const costoTotalU = cImpresionU + insumosU;
  const pUni = costoTotalU * T.multiplicadorVenta;
  const r = Math.round;
  return {
    kwhTotal: kwh, costoFilamento: r(cFil), costoEnergia: r(cEn), subtotal: r(sub),
    mantenimiento: r(mant), totalCama: r(totalCama), costoImpresionUnidad: r(cImpresionU),
    costoTotalUnidad: r(costoTotalU), precioUnidad: r(pUni), totalVenta: r(pUni * unidades),
  };
}

let ok = 0, mal = 0;
const check = (n, real, esp) => {
  if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  OK    ${n}`); }
  else { mal++; console.log(`  FALLO ${n}\n        esperado ${JSON.stringify(esp)}\n        real     ${JSON.stringify(real)}`); }
};

const ESC = [
  ['Ender 3 S1 Pro', 10,      100,    1,  []],
  ['Creality HI',    19.15,   498.68, 1,  []],
  ['Ender 3 S1 Pro', 7.5,     45.5,   1,  []],
  ['Creality HI',    31.7597, 498.68, 1,  []],
  ['Ender 3 S1 Pro', 3.3333,  12.7,   1,  []],
  ['Creality HI',    19.15,   498.68, 40, [{ precioUnidad: 400 }, { precioUnidad: 56 }]],
  ['Ender 3 S1 Pro', 10.8333, 263.93, 16, []],
  ['Creality HI',    5.6,     139.65, 6,  [{ precioUnidad: 6000 }]],
];

console.log('\n════ 1) SERVIDOR vs SPEC ════');
{
  const { Calculadora } = cargar(crearSS());
  for (const [imp, h, g, u, ins] of ESC) {
    const s = spec(imp, h, g, u, ins.reduce((a, i) => a + i.precioUnidad, 0));
    const c = Calculadora.calcular({ impresora: imp, tiempoHoras: h, filamentoGramos: g, unidadesPorCama: u, insumos: ins }, T);
    const campos = ['costoFilamento', 'costoEnergia', 'subtotal', 'mantenimiento', 'totalCama', 'costoImpresionUnidad', 'costoTotalUnidad', 'precioUnidad', 'totalVenta'];
    check(`${imp} ${h}h ${g}g ${u}u`, campos.map(k => c[k]), campos.map(k => s[k]));
    check(`  └ kWh ${s.kwhTotal.toFixed(4)}`, c.kwhTotal.toFixed(6), s.kwhTotal.toFixed(6));
  }
}

console.log('\n════ 2) CLIENTE (preview) == SERVIDOR (guardado), al peso ════');
{
  const { Calculadora } = cargar(crearSS());
  for (const [imp, h, g, u, ins] of ESC) {
    const cl = cliente(imp, h, g, u, ins);
    const sv = Calculadora.calcular({ impresora: imp, tiempoHoras: h, filamentoGramos: g, unidadesPorCama: u, insumos: ins }, T);
    const campos = ['costoFilamento', 'costoEnergia', 'subtotal', 'mantenimiento', 'totalCama', 'costoImpresionUnidad', 'costoTotalUnidad', 'precioUnidad', 'totalVenta'];
    check(`${imp} ${h}h ${g}g ${u}u`, campos.map(k => cl[k]), campos.map(k => sv[k]));
  }
}

console.log('\n════ 3) MIGRACIÓN desde el esquema original de 22 columnas, con datos ════');
{
  // Réplica del layout real: encabezado con "Hola" y "Mantenimiento (5%)", 2 filas
  const ENC_VIEJO = ['Hola', 'Miniatura', 'Nombre de la pieza', 'Impresora', 'Multicolor',
    'Tiempo impresión', 'Filamento (g)', 'Ancho (mm)', 'Largo (mm)', 'Alto (mm)', 'Piezas en cama',
    'Costo filamento', 'Costo energía', 'Subtotal', 'Mantenimiento (5%)', 'Total costo (cama)',
    'Costo impresión/u', 'Insumos/u', 'Costo total/u', 'Precio venta/u', 'Total venta (cama)', 'Fecha'];
  const FILA1 = [1, '', 'Aleta Derecha', 'Ender 3 S1 Pro', 'No', '19h 09m', 323.81, 111.2, 159.7, 265, 1,
    25905, 2268, 28173, 1409, 29582, 29582, 2250, 31832, 95495, 95495, 'FECHA1'];
  const FILA2 = [2, '', 'Extintores', 'Ender 3 S1 Pro', 'Sí 🎨', '31h 46m', 498.68, 247.7, 216.2, 63.3, 40,
    39894, 3745, 43639, 2182, 45821, 1146, 356, 1502, 4505, 180184, 'FECHA2'];

  const cot = crearHoja('Cotizaciones');
  cot._g.push(ENC_VIEJO.slice(), FILA1.slice(), FILA2.slice());
  const ss = crearSS({ Cotizaciones: cot });
  const avisos = [];
  const { Hoja } = cargar(ss, avisos);

  check('antes: 22 columnas', cot.getLastColumn(), 22);
  Hoja.inicializar();
  check('después: 24 columnas (kWh + Precio real)', cot.getLastColumn(), 24);
  check('encabezado normalizado (A1 ya no dice "Hola")', cot._g[0][0], 'ID');
  check('kWh total en la posición 12', cot._g[0][11], 'kWh total');
  check('"Mantenimiento" sin el (5%)', cot._g[0][15], 'Mantenimiento');
  check('Precio real/u tras Total venta (cama)', [cot._g[0][21], cot._g[0][22]], ['Total venta (cama)', 'Precio real/u']);
  check('Fecha sigue al final', cot._g[0][23], 'Fecha');
  // los datos históricos se desplazaron, no se perdieron
  check('fila 1: kWh vacío', cot._g[1][11], '');
  check('fila 1: Costo filamento intacto', cot._g[1][12], 25905);
  check('fila 1: Precio venta intacto', cot._g[1][20], 95495);
  check('fila 1: Total venta intacto', cot._g[1][21], 95495);
  check('fila 1: Precio real vacío', cot._g[1][22], '');
  check('fila 1: Fecha intacta', cot._g[1][23], 'FECHA1');
  check('fila 1: Nombre intacto', cot._g[1][2], 'Aleta Derecha');
  check('fila 2: Piezas en cama intacto', cot._g[2][10], 40);
  // Insumos/u estaba en el índice 17 y tras la inserción queda en el 18
  check('fila 2: Costo impresión/u desplazado', cot._g[2][17], 1146);
  check('fila 2: Insumos/u desplazado', cot._g[2][18], 356);
  check('fila 2: Costo total/u desplazado', cot._g[2][19], 1502);
  check('avisó de la migración', /migrada/.test(avisos.join(' ')), true);

  // idempotencia
  const antes = JSON.stringify(cot._g);
  Hoja.inicializar();
  check('idempotente: segunda llamada no cambia nada', JSON.stringify(cot._g), antes);
  check('24 columnas tras repetir', cot.getLastColumn(), 24);
}

console.log('\n════ 4) La migración se niega ante un layout desconocido ════');
{
  const cot = crearHoja('Cotizaciones');
  cot._g.push(['ID', 'Nombre', 'Otra'], [1, 'x', 'y']);
  const ss = crearSS({ Cotizaciones: cot });
  const { Hoja } = cargar(ss);
  let err = null;
  try { Hoja.inicializar(); } catch (e) { err = e.message; }
  check("lanza en vez de escribir mal", /no parece una versión anterior/.test(err || ""), true);
  check('no tocó los datos', cot._g[1], [1, 'x', 'y']);
}

console.log('\n════ 5) Hoja nueva: 24 columnas y fila completa ════');
{
  const ss = crearSS(); const avisos = [];
  const { Hoja, Calculadora, Config } = cargar(ss, avisos);
  Hoja.inicializar();
  const cot = ss._hojas['Cotizaciones'];
  check('24 encabezados', cot._g[0].length, 24);
  check('sin avisos de migración', avisos.filter(a => /migrada/.test(a)).length, 0);

  const datos = { impresora: 'Creality HI', tiempoHoras: 19.15, filamentoGramos: 498.68,
                  unidadesPorCama: 1, insumos: [], nombrePieza: 'Prueba', multicolor: false,
                  anchoMm: 10, largoMm: 20, altoMm: 30 };
  const costos = Calculadora.calcular(datos, Config.tarifas());
  Hoja.agregarFilaCotizacion(7, datos, costos, '');
  const fila = cot._g[cot.getLastRow() - 1];
  check('la fila tiene 24 valores', fila.length, 24);
  check('kWh en la posición 12', Number(fila[11].toFixed(4)), 3.4758);
  check('Costo filamento en la 13', fila[12], 39894);
  check('Precio venta en la 21', fila[20], 134098);
  check('Total venta en la 22', fila[21], 134098);
  check('Precio real/u nace vacía en la 23', fila[22], '');
  check('formato 4 decimales en kWh', cot._fmt[`${cot.getLastRow()},12`], '0.0000');
  check('formato moneda en Total venta (col 22)', cot._fmt[`${cot.getLastRow()},22`], '"$"#,##0');
  check('formato moneda en Precio real/u (col 23)', cot._fmt[`${cot.getLastRow()},23`], '"$"#,##0');
  check('resaltado verde en Precio venta/u (col 21)', cot._fondo[`${cot.getLastRow()},21`], '#e8f5e9');
  check('resaltado verde en Total venta (col 22)', cot._fondo[`${cot.getLastRow()},22`], '#e8f5e9');
  check('resaltado ámbar en Precio real/u (col 23)', cot._fondo[`${cot.getLastRow()},23`], '#fff8e1');
  check('nota explicativa en el encabezado', /a mano/.test(cot._notas['1,23'] || ''), true);
}

console.log('\n════ 6) LIMPIEZA de miniaturas huérfanas ════');
{
  const ID = {
    formula: '1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',   // enlazada en un =IMAGE
    texto:   '1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',   // pegada como texto
    huerf1:  '1ccccccccccccccccccccccccccccccccccc',
    huerf2:  '1ddddddddddddddddddddddddddddddddddd',
    pdf:     '1eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',   // no es imagen
    borrada: '1fffffffffffffffffffffffffffffffffff',   // ya en la papelera
  };

  const cot = crearHoja('Cotizaciones');
  cot._g.push(
    ['ID', 'Miniatura', 'Nombre'],
    [1, `=IMAGE("https://drive.google.com/uc?export=view&id=${ID.formula}";4;60;60)`, 'con miniatura'],
    [2, '', 'sin miniatura']
  );
  // El enlace pegado como texto vive en otra hoja, para probar que se barre el libro entero
  const notas = crearHoja('Notas');
  notas._g.push(['Pendientes'], [`revisar https://drive.google.com/file/d/${ID.texto}/view`]);

  const ss = crearSS({ Cotizaciones: cot, Notas: notas });
  const drive = crearDriveApp({
    Cotizador3D_Miniaturas: [
      { id: ID.formula, nombre: 'pieza_A.png' },
      { id: ID.texto,   nombre: 'pieza_B.png' },
      { id: ID.huerf1,  nombre: 'pieza_C.png' },
      { id: ID.huerf2,  nombre: 'pieza_D.png' },
      { id: ID.pdf,     nombre: 'notas.pdf', tipo: 'application/pdf' },
      { id: ID.borrada, nombre: 'pieza_F.png', papelera: true },
    ],
  });
  const { Hoja, Drive } = cargar(ss, [], drive);

  const texto = Hoja.textoDelLibro();
  check('el texto del libro incluye la fórmula =IMAGE', texto.indexOf(ID.formula) !== -1, true);
  check('y el enlace pegado en otra hoja', texto.indexOf(ID.texto) !== -1, true);
  check('y no inventa ids', texto.indexOf(ID.huerf1) === -1, true);

  const a = Drive.analizarMiniaturas(texto);
  check('total sin contar la que ya estaba en papelera', a.total, 5);
  check('referenciadas', a.referenciadas, 2);
  check('huérfanas', a.huerfanas.map(h => h.nombre), ['pieza_C.png', 'pieza_D.png']);
  check('omitidas por no ser imagen', a.omitidas.length, 1);
  check('y se nombra el pdf', /notas\.pdf/.test(a.omitidas[0]), true);
  check('analizar no borra nada', drive._carpetas.Cotizador3D_Miniaturas.filter(f => f.papelera).length, 1);

  const r = Drive.enviarAPapelera(a.huerfanas);
  check('enviadas a la papelera', r.enviadas, 2);
  check('sin errores', r.errores.length, 0);
  const enPapelera = drive._carpetas.Cotizador3D_Miniaturas.filter(f => f.papelera).map(f => f.nombre);
  check('las correctas quedaron en papelera', enPapelera.sort(), ['pieza_C.png', 'pieza_D.png', 'pieza_F.png']);

  const a2 = Drive.analizarMiniaturas(texto);
  check('segunda pasada: ya no hay huérfanas', a2.huerfanas.length, 0);
  check('y el total baja a las que quedan', a2.total, 3);
}

console.log('\n════ 6b) Casos límite de la limpieza ════');
{
  // Sin carpeta de miniaturas
  const { Drive } = cargar(crearSS({ Cotizaciones: crearHoja('Cotizaciones') }), [], crearDriveApp({}));
  const a = Drive.analizarMiniaturas('cualquier texto');
  check('sin carpeta: total 0 y nada que borrar', [a.total, a.huerfanas.length], [0, 0]);
}
{
  // Un archivo que falla al borrarse no detiene a los demás
  const drive = crearDriveApp({
    Cotizador3D_Miniaturas: [
      { id: 'g'.repeat(35), nombre: 'ok.png' },
      { id: 'h'.repeat(35), nombre: 'protegida.png', fallar: true },
    ],
  });
  const { Drive } = cargar(crearSS({ Cotizaciones: crearHoja('Cotizaciones') }), [], drive);
  const a = Drive.analizarMiniaturas('');
  check('las dos son huérfanas', a.huerfanas.length, 2);
  const r = Drive.enviarAPapelera(a.huerfanas);
  check('una se borró', r.enviadas, 1);
  check('la otra se reporta', r.errores.length, 1);
  check('y dice cuál', /protegida\.png/.test(r.errores[0]), true);
}
{
  // Libro vacío: no debe reventar ni marcar nada
  const { Hoja } = cargar(crearSS({ Vacia: crearHoja('Vacia') }), []);
  check('texto del libro vacío', Hoja.textoDelLibro().trim(), '');
}

console.log('\n════ 7) Formato de tiempo: "41h 60m" ya no ocurre ════');
{
  const ss = crearSS(); const { Hoja, Calculadora, Config } = cargar(ss);
  Hoja.inicializar();
  const cot = ss._hojas['Cotizaciones'];
  const casos = [[41.9999, '42h 00m'], [19.1428, '19h 09m'], [0.99993, '1h 00m'], [7.5, '7h 30m']];
  for (const [horas, esperado] of casos) {
    const datos = { impresora: 'Creality HI', tiempoHoras: horas, filamentoGramos: 10,
                    unidadesPorCama: 1, insumos: [], nombrePieza: 'x' };
    Hoja.agregarFilaCotizacion(1, datos, Calculadora.calcular(datos, Config.tarifas()), '');
    check(`${horas} h → ${esperado}`, cot._g[cot.getLastRow() - 1][5], esperado);
  }
}



// ══════════════════════════════════════════════════════════════
//  8) PARSER DE G-CODE
// ══════════════════════════════════════════════════════════════
const DOCS = path.join(RAIZ, 'docs');
const Gcode = (() => {
  const html = fs.readFileSync(`${SRC}/Gcode.html`, 'utf8');
  const codigo = html.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');
  return new Function(codigo + '\nreturn { Gcode };')().Gcode;
})();
const r2 = v => Math.round(v * 100) / 100;

console.log('\n════ 8) Parser contra los recortes reales de cada laminador ════');
{
  const esperado = {
    'creality-recorte.gcode': {
      laminador: ['creality', 'Creality Print', '7.2.2.5483'],
      tiempoTexto: '3h 59m 25s', horas: 3.99, gramos: 67,
      cruda: 'Creality Hi', impresora: 'Creality HI',
      dims: [138.78, 71.13, 44.43], fuenteDims: 'MIN/MAX',
      multicolor: false, objetos: 2, faltantes: 0,
    },
    'orca-recorte.gcode': {
      laminador: ['orca', 'OrcaSlicer', '2.4.2'],
      tiempoTexto: '3h 6m 44s', horas: 3.11, gramos: 62.36,
      cruda: 'Creality Hi', impresora: 'Creality HI',
      dims: [138.4, 67.99, 44.4], fuenteDims: 'EXCLUDE_OBJECT_DEFINE',
      multicolor: false, objetos: 2, faltantes: 0,
    },
  };

  for (const archivo of Object.keys(esperado)) {
    const e = esperado[archivo];
    const d = Gcode.parsear(fs.readFileSync(`${DOCS}/fixtures/${archivo}`, 'utf8'));
    const p = archivo.split('-')[0];
    check(`${p}: laminador`, [d.laminador.clave, d.laminador.nombre, d.laminador.version], e.laminador);
    check(`${p}: tiempo`, [d.tiempoTexto, r2(d.tiempoHoras)], [e.tiempoTexto, e.horas]);
    check(`${p}: gramos`, r2(d.gramos), e.gramos);
    check(`${p}: impresora`, [d.impresoraCruda, d.impresora], [e.cruda, e.impresora]);
    check(`${p}: dimensiones`, [r2(d.dimensiones.x), r2(d.dimensiones.y), r2(d.dimensiones.z)], e.dims);
    check(`${p}: fuente de dimensiones`, d.dimensiones.fuente, e.fuenteDims);
    check(`${p}: multicolor`, d.multicolor.es, e.multicolor);
    check(`${p}: objetos detectados`, d.objetos.length, e.objetos);
    check(`${p}: miniatura extraída`, d.thumbnailBase64 !== null && d.thumbnailBase64.length > 1000, true);
    check(`${p}: sin datos faltantes`, d.faltantes.length, e.faltantes);
  }
}

console.log('\n════ 8b) Reconocimiento de modelo de impresora ════');
{
  const casos = [
    ['Creality Hi', 'Creality HI'],
    ['Creality Hi 0.4 nozzle - JD', 'Creality HI'],
    ['Ender 3 S1 Pro', 'Ender 3 S1 Pro'],
    ['Creality Ender-3 S1 Pro 0.4', 'Ender 3 S1 Pro'],
    ['Creality Ender-3 V3 High Speed', null],
    ['Creality K1 Max', null],
    ['', null],
  ];
  casos.forEach(([crudo, esp]) => check(`"${crudo}" → ${esp}`, Gcode.reconocerModelo(crudo), esp));
}

console.log('\n════ 8c) Conversión de tiempo a horas ════');
{
  [['1d 7h 45m 35s', 31.76], ['19h 09m', 19.15], ['3h 6m 44s', 3.11],
   ['41h 60m', 42], ['0h 11m', 0.18], ['', 0]]
    .forEach(([t, esp]) => check(`"${t}" → ${esp} h`, r2(Gcode.horasDesdeTexto(t)), esp));
}

console.log('\n════ 8d) Señales de multicolor ════');
{
  const base = '; generated by OrcaSlicer 2.4.2 on 2026-01-01 at 00:00:00\n; max_z_height: 10.00\n';
  const pie = '\n; estimated printing time (normal mode) = 1h 00m 00s\n; printer_model = Creality Hi\n';

  const dosHerramientas = Gcode.parsear(base + 'G1 X1\nT0\nG1 X2\nT1\nG1 X3\n; filament used [g] = 50.00' + pie);
  check('dos herramientas → multicolor', dosHerramientas.multicolor.es, true);
  check('y lo justifica', /2 herramientas/.test(dosHerramientas.multicolor.razon), true);

  const dosCarretes = Gcode.parsear(base + 'T0\n; filament used [g] = 0.00, 386.30, 112.38, 0.00' + pie);
  check('dos carretes con consumo → multicolor', dosCarretes.multicolor.es, true);
  check('y suma los carretes', r2(dosCarretes.gramos), 498.68);

  const metodo = Gcode.parsear('; generated by Creality_Print V7.0 on x\n; multicolor_method = 2\n; max_z_height: 5.00\nT0\n; filament used [g] = 10.00' + pie);
  check('multicolor_method = 2 → multicolor', metodo.multicolor.es, true);

  const unColor = Gcode.parsear(base + 'T0\n; filament used [g] = 50.00' + pie);
  check('una herramienta y un carrete → un color', unColor.multicolor.es, false);
}

console.log('\n════ 8e) Robustez del barrido ════');
{
  const conMiniatura = [
    '; generated by OrcaSlicer 2.4.2 on x',
    '; max_z_height: 10.00',
    '; thumbnail begin 16x16 40',
    '; iVBORw0KGgoAAAANSUhEUgAAABAAAAAQ',
    '; GHlQAAAABJRU5ErkJggg==',
    '; thumbnail end',
    '; printer_model = Creality Hi',
    '; estimated printing time (normal mode) = 2h 30m 00s',
    '; filament used [g] = 12.34',
  ].join('\n');
  const m = Gcode.parsear(conMiniatura);
  check('miniatura recompuesta', m.thumbnailBase64, 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQGHlQAAAABJRU5ErkJggg==');
  check('el base64 con "=" no rompió las claves', [m.tiempoTexto, r2(m.gramos)], ['2h 30m 00s', 12.34]);

  const crlf = Gcode.parsear(conMiniatura.split('\n').join('\r\n'));
  check('CRLF: tiempo', crlf.tiempoTexto, '2h 30m 00s');
  check('CRLF: gramos', r2(crlf.gramos), 12.34);
  check('CRLF: impresora', crlf.impresora, 'Creality HI');

  const copias = Gcode.parsear([
    '; generated by OrcaSlicer 2.4.2 on x', '; max_z_height: 3.00',
    '; printing object pieza.stl id:0 copy 0',
    '; printing object pieza.stl id:0 copy 1',
    '; printing object pieza.stl id:0 copy 2',
    '; printing object pieza.stl id:0 copy 1',
    '; filament used [g] = 5.00',
  ].join('\n'));
  check('3 copias del mismo objeto', copias.objetos, [{ nombre: 'pieza.stl', copias: 3 }]);

  const raro = Gcode.parsear('; sliced by OtroSlicer 9.9\nG1 X1\n');
  check('laminador desconocido', raro.laminador.clave, 'desconocido');
  check('y reporta todo como faltante', raro.faltantes.sort(),
    ['dimensiones', 'filamento', 'impresora', 'tiempo', 'unidades']);

  const vacio = Gcode.parsear('');
  check('texto vacío no revienta', [vacio.laminador.clave, vacio.gramos, vacio.objetos.length],
    ['desconocido', null, 0]);

  const elapsed = Gcode.parsear([
    '; generated by OrcaSlicer 2.4.2 on x', '; max_z_height: 3.00',
    ';TIME_ELAPSED:100.0', ';TIME_ELAPSED:5400.0',
    '; printer_model = Creality Hi', '; filament used [g] = 5.00',
  ].join('\n'));
  check('respaldo TIME_ELAPSED', [elapsed.tiempoTexto, elapsed.fuentes.tiempo], ['1h 30m', 'TIME_ELAPSED']);
}


console.log('\n════ 9) Migración desde el esquema actual, con una columna propia del usuario ════');
{
  const ENC_23 = ['ID', 'Miniatura', 'Nombre de la pieza', 'Impresora', 'Multicolor',
    'Tiempo impresión', 'Filamento (g)', 'Ancho (mm)', 'Largo (mm)', 'Alto (mm)', 'Piezas en cama',
    'kWh total', 'Costo filamento', 'Costo energía', 'Subtotal', 'Mantenimiento',
    'Total costo (cama)', 'Costo impresión/u', 'Insumos/u', 'Costo total/u', 'Precio venta/u',
    'Total venta (cama)', 'Fecha'];
  const FILA = [7, '', 'pieza', 'Creality HI', 'No', '3h 07m', 62.36, 10, 20, 30, 1,
    0.589, 4989, 454, 5442, 272, 5714, 5714, 0, 5714, 17143, 17143, 'FECHA'];

  const cot = crearHoja('Cotizaciones');
  cot._g.push(ENC_23.concat(['Mis notas']), FILA.concat(['entregado al cliente']));
  const ss = crearSS({ Cotizaciones: cot });
  const avisos = [];
  const { Hoja } = cargar(ss, avisos);

  check('antes: 24 columnas (23 + la del usuario)', cot.getLastColumn(), 24);
  Hoja.inicializar();
  check('después: 25 columnas', cot.getLastColumn(), 25);
  check('Precio real/u insertada en la 23', cot._g[0][22], 'Precio real/u');
  check('la columna del usuario sobrevive, desplazada', cot._g[0][24], 'Mis notas');
  check('y su dato también', cot._g[1][24], 'entregado al cliente');
  check('Precio venta intacto', cot._g[1][20], 17143);
  check('Total venta no se movió', cot._g[1][21], 17143);
  check('Precio real nace vacío', cot._g[1][22], '');
  check('Fecha desplazada', cot._g[1][23], 'FECHA');
  check('avisó de una sola inserción', /insertadas 1 columna/.test(avisos.join(' ')), true);
  check('sin renombrados', /renombradas/.test(avisos.join(' ')), false);
}

console.log('\n════ 10) La migración detecta una columna en la posición equivocada ════');
{
  // Esquema completo pero con Precio real/u donde estaba antes (tras Precio venta/u)
  const MAL = ['ID', 'Miniatura', 'Nombre de la pieza', 'Impresora', 'Multicolor',
    'Tiempo impresión', 'Filamento (g)', 'Ancho (mm)', 'Largo (mm)', 'Alto (mm)', 'Piezas en cama',
    'kWh total', 'Costo filamento', 'Costo energía', 'Subtotal', 'Mantenimiento',
    'Total costo (cama)', 'Costo impresión/u', 'Insumos/u', 'Costo total/u', 'Precio venta/u',
    'Precio real/u', 'Total venta (cama)', 'Fecha'];
  const FILA = [1, '', 'pieza', 'Creality HI', 'No', '3h 07m', 62.36, 10, 20, 30, 1,
    0.589, 4989, 454, 5442, 272, 5714, 5714, 0, 5714, 17143, '', 17143, 'FECHA'];

  const cot = crearHoja('Cotizaciones');
  cot._g.push(MAL.slice(), FILA.slice());
  const ss = crearSS({ Cotizaciones: cot });
  const { Hoja } = cargar(ss);

  const antes = JSON.stringify(cot._g);
  let err = null;
  try { Hoja.inicializar(); } catch (e) { err = e.message; }
  check('lanza en vez de escribir corrido', err !== null, true);
  check('señala la posición y qué se esperaba', /posición 22 hay .Precio real\/u. y se esperaba .Total venta \(cama\)./.test(err || ''), true);
  check('no sugiere borrar una columna con datos', /bórrala/.test(err || ''), false);
  check('pide reordenar según el esquema', /Reordena la fila 1/.test(err || ''), true);
  check('no tocó nada de la hoja', JSON.stringify(cot._g), antes);
}

console.log(`\n═══ ${ok} OK · ${mal} fallos ═══\n`);
process.exit(mal ? 1 : 0);
