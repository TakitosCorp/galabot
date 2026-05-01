const winston = require("winston");
const fs = require("fs");
const path = require("path");

function ensureLogsFolder() {
  const logsDir = path.join(__dirname, "..", "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

const logsDir = ensureLogsFolder();

const combinedFileTransport = new winston.transports.File({
  filename: path.join(logsDir, "combined.log"),
});
const consoleTransport = new winston.transports.Console();

const twitchLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [Twitch] ${level}: ${message}`;
    }),
  ),
  transports: [
    consoleTransport,
    new winston.transports.File({ filename: path.join(logsDir, "twitch.log") }),
    combinedFileTransport,
  ],
});

const discordLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [Discord] ${level}: ${message}`;
    }),
  ),
  transports: [
    consoleTransport,
    new winston.transports.File({
      filename: path.join(logsDir, "discord.log"),
    }),
    combinedFileTransport,
  ],
});

const dbLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [DB] ${level}: ${message}`;
    }),
  ),
  transports: [
    consoleTransport,
    new winston.transports.File({ filename: path.join(logsDir, "db.log") }),
    combinedFileTransport,
  ],
});

const sysLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [SYS] ${level}: ${message}`;
    }),
  ),
  transports: [
    consoleTransport,
    new winston.transports.File({ filename: path.join(logsDir, "system.log") }),
    combinedFileTransport,
  ],
});

function twitchLog(level, message) {
  twitchLogger.log({ level, message });
}
function discordLog(level, message) {
  discordLogger.log({ level, message });
}
function dbLog(level, message) {
  dbLogger.log({ level, message });
}
function sysLog(level, message) {
  sysLogger.log({ level, message });
}

module.exports = {
  ensureLogsFolder,
  twitchLog,
  discordLog,
  dbLog,
  sysLog,
};
