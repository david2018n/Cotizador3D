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

  function _obtenerOCrearCarpeta() {
    const iter = DriveApp.getFoldersByName(CARPETA_NOMBRE);
    return iter.hasNext() ? iter.next() : DriveApp.createFolder(CARPETA_NOMBRE);
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

  return { guardarMiniatura };

})();