const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize } = format;
const path = require("path");

const createCustomLogger = (label, logFile) => {
  const logFormat = printf(({ level, message, timestamp, stack }) => {
    const ts = timestamp.slice(0, 19).replace("T", " ");
    return stack ? `[${ts}] ${level}: ${message}\n${stack}` : `[${ts}] ${level}: ${message}`;
  });

  return createLogger({
    level: "info", // Nivel predeterminado
    format: combine(colorize(), timestamp(), logFormat),
    transports: [
      new transports.Console(),
      new transports.File({
        filename: path.join("logs", logFile),
        format: combine(format.uncolorize(), logFormat),
      }),
    ],
  });
};

module.exports = { createCustomLogger };
