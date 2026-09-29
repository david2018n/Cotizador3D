// ============================================================
//  Drive.gs — Operaciones sobre Google Drive
// ============================================================

const Drive = (() => {

  const CARPETA_NOMBRE = "Cotizador3D_Miniaturas";

  function guardarMiniatura(base64, nombrePieza) {
    const carpeta = _obtenerOCrearCarpeta();
    const blob    = _crearBlob(base64, nombrePieza);
    const archivo = carpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return `https://drive.google.com/uc?export=view&id=${archivo.getId()}`;
  }

  /**
   * Clasifica las miniaturas de la carpeta según sigan enlazadas o no.
   *
   * La pregunta se hace al revés de lo que parece natural: en vez de extraer
   * URLs del documento y parsearlas, se toma el ID de cada archivo y se busca
   * dentro del texto del libro. Así da igual el formato del enlace
   * (`uc?export=view&id=`, `/file/d/…`, o pegado como texto), y los IDs de
   * Drive son lo bastante largos como para que no haya coincidencias falsas.
   *
   * No borra nada: solo informa. Tampoco crea la carpeta si no existe.
   *
   * @param textoDelLibro  Todo el texto del documento (Hoja.textoDelLibro()).
   */
  function analizarMiniaturas(textoDelLibro) {
    const resultado = { total: 0, referenciadas: 0, huerfanas: [], omitidas: [] };
    const carpeta = _buscarCarpeta();
    if (!carpeta) return resultado;

    const archivos = carpeta.getFiles();
    while (archivos.hasNext()) {
      const archivo = archivos.next();
      if (archivo.isTrashed()) continue;        // ya en la papelera

      resultado.total++;

      const tipo = archivo.getMimeType();
      if (tipo.indexOf("image/") !== 0) {
        resultado.omitidas.push(`• ${archivo.getName()} (${tipo})`);
        continue;
      }

      if (textoDelLibro.indexOf(archivo.getId()) !== -1) {
        resultado.referenciadas++;
      } else {
        resultado.huerfanas.push({ id: archivo.getId(), nombre: archivo.getName() });
      }
    }
    return resultado;
  }

  /**
   * Manda a la papelera las miniaturas indicadas. Se usa setTrashed en lugar de
   * un borrado definitivo: Drive las conserva y se pueden restaurar.
   */
  function enviarAPapelera(huerfanas) {
    const resultado = { enviadas: 0, errores: [] };
    (huerfanas || []).forEach(h => {
      try {
        DriveApp.getFileById(h.id).setTrashed(true);
        resultado.enviadas++;
      } catch (e) {
        resultado.errores.push(`• ${h.nombre}: ${e.message}`);
      }
    });
    return resultado;
  }

  function _buscarCarpeta() {
    const iter = DriveApp.getFoldersByName(CARPETA_NOMBRE);
    return iter.hasNext() ? iter.next() : null;
  }

  function _obtenerOCrearCarpeta() {
    return _buscarCarpeta() || DriveApp.createFolder(CARPETA_NOMBRE);
  }

  function _crearBlob(base64, nombrePieza) {
    return Utilities.newBlob(
      Utilities.base64Decode(base64),
      "image/png",
      `${_sanitizar(nombrePieza)}_${Date.now()}.png`
    );
  }

  function _sanitizar(nombre) {
    return (nombre || "pieza").replace(/[^a-zA-Z0-9_\-]/g, "_");
  }

  return { guardarMiniatura, analizarMiniaturas, enviarAPapelera, CARPETA: CARPETA_NOMBRE };

})();