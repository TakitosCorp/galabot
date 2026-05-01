const fs = require("fs");
const path = require("path");

/**
 * Reads a JSON file. If it doesn't exist, creates it with the default value.
 * @param {string} filePath
 * @param {any} defaultValue
 * @returns {any}
 */
function readJSON(filePath, defaultValue = null) {
  ensureFileExists(filePath, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Error reading JSON at ${filePath}:`, err);
    return defaultValue;
  }
}

/**
 * Writes data to a JSON file.
 * @param {string} filePath
 * @param {any} data
 */
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing JSON at ${filePath}:`, err);
  }
}

/**
 * Ensures a file exists, creating it with the default value if needed.
 * @param {string} filePath
 * @param {any} defaultValue
 */
function ensureFileExists(filePath, defaultValue = {}) {
  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    } catch (err) {
      console.error(`Error creating file ${filePath}:`, err);
    }
  }
}

/**
 * Returns the absolute path for a relative path under /data.
 * @param {string} relativePath
 * @returns {string}
 */
function getFilePath(relativePath) {
  return path.join(__dirname, "../data", relativePath);
}

/**
 * Deletes a file if it exists.
 * @param {string} filePath
 */
function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error(`Error deleting file ${filePath}:`, err);
    }
  }
}

/**
 * Lists files in a directory.
 * @param {string} dirPath
 * @returns {string[]}
 */
function listFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (err) {
    console.error(`Error listing files in ${dirPath}:`, err);
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
