const fs = require("fs");
const path = require("path");
const { sysLog } = require("./loggers");

function readJSON(filePath, defaultValue = null) {
  ensureFileExists(filePath, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    sysLog("error", `Error reading JSON at ${filePath}: ${err.message}`);
    return defaultValue;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    sysLog("error", `Error writing JSON at ${filePath}: ${err.message}`);
  }
}

function ensureFileExists(filePath, defaultValue = {}) {
  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    } catch (err) {
      sysLog("error", `Error creating file ${filePath}: ${err.message}`);
    }
  }
}

function getFilePath(relativePath) {
  return path.join(__dirname, "../data", relativePath);
}

function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      sysLog("error", `Error deleting file ${filePath}: ${err.message}`);
    }
  }
}

function listFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (err) {
    sysLog("error", `Error listing files in ${dirPath}: ${err.message}`);
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
