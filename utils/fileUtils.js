const fs = require("fs");
const path = require("path");

function readJSON(filePath, defaultValue = null) {
  ensureFileExists(filePath, defaultValue);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  // Sobrescribe el archivo siempre
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function ensureFileExists(filePath, defaultValue = {}) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function getFilePath(relativePath) {
  return path.join(__dirname, "../data", relativePath);
}

module.exports = {
  readJSON,
  writeJSON,
  getFilePath,
  ensureFileExists,
};
