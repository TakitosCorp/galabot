const fs = require("fs");
const path = require("path");

/**
 * Lee un archivo JSON. Si no existe, lo crea con el valor por defecto.
 * @param {string} filePath
 * @param {any} defaultValue
 * @returns {any}
 */
function readJSON(filePath, defaultValue = null) {
  ensureFileExists(filePath, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Error leyendo JSON en ${filePath}:`, err);
    return defaultValue;
  }
}

/**
 * Escribe datos en un archivo JSON, validando el formato.
 * @param {string} filePath
 * @param {any} data
 */
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error escribiendo JSON en ${filePath}:`, err);
  }
}

/**
 * Asegura que el archivo existe, creándolo si es necesario.
 * @param {string} filePath
 * @param {any} defaultValue
 */
function ensureFileExists(filePath, defaultValue = {}) {
  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    } catch (err) {
      console.error(`Error creando archivo ${filePath}:`, err);
    }
  }
}

/**
 * Obtiene la ruta absoluta a partir de una ruta relativa en /data.
 * @param {string} relativePath
 * @returns {string}
 */
function getFilePath(relativePath) {
  return path.join(__dirname, "../data", relativePath);
}

/**
 * Elimina un archivo si existe.
 * @param {string} filePath
 */
function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error(`Error eliminando archivo ${filePath}:`, err);
    }
  }
}

/**
 * Lista los archivos en un directorio.
 * @param {string} dirPath
 * @returns {string[]}
 */
function listFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (err) {
    console.error(`Error listando archivos en ${dirPath}:`, err);
    return [];
  }
}

module.exports = {
  readJSON,
  writeJSON,
  getFilePath,
  ensureFileExists,
  deleteFile,
  listFiles,
};
