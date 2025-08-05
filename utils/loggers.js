const winston = require("winston");
const fs = require("fs");
const path = require("path");

// Ensures that the logs directory exists, creates it if not.
function ensureLogsFolder() {
  const logsDir = path.join(__dirname, "..", "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

const logsDir = ensureLogsFolder();

// Transport for writing combined logs to file.
const combinedFileTransport = new winston.transports.File({ filename: path.join(logsDir, "combined.log") });
// Transport for logging to console.
const consoleTransport = new winston.transports.Console();

// Logger for Twitch events/messages.
const twitchLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [Twitch] ${level}: ${message}`;
    })
  ),
  transports: [
    consoleTransport,
    new winston.transports.File({ filename: path.join(logsDir, "twitch.log") }),
    combinedFileTransport,
  ],
});

// Logger for Discord events/messages.
const discordLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [Discord] ${level}: ${message}`;
    })
  ),
  transports: [
    consoleTransport,
    new winston.transports.File({ filename: path.join(logsDir, "discord.log") }),
    combinedFileTransport,
  ],
});

// Logger for database events/messages.
const dbLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [DB] ${level}: ${message}`;
    })
  ),
  transports: [
    consoleTransport,
    new winston.transports.File({ filename: path.join(logsDir, "db.log") }),
    combinedFileTransport,
  ],
});

// Logs a message to the Twitch logger.
function twitchLog(level, message) {
  twitchLogger.log({ level, message });
}
// Logs a message to the Discord logger.
function discordLog(level, message) {
  discordLogger.log({ level, message });
}
// Logs a message to the DB logger.
function dbLog(level, message) {
  dbLogger.log({ level, message });
}

module.exports = {
  ensureLogsFolder,
  twitchLog,
  discordLog,
  dbLog,
};
