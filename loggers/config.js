const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize } = format;
const path = require("path");

const createCustomLogger = (label) => {
  const logFormat = printf(({ level, message, timestamp, stack }) => {
    const ts = timestamp.slice(0, 19).replace("T", " ");
    return stack ? `[${ts}] ${level}: ${message}\n${stack}` : `[${ts}] ${level}: ${message}`;
  });

  const combinedLogFormat = printf(({ level, message, timestamp, stack, label }) => {
    const ts = timestamp.slice(0, 19).replace("T", " ");
    return stack 
      ? `[${ts}] [${label}] ${level}: ${message}\n${stack}` 
      : `[${ts}] [${label}] ${level}: ${message}`;
  });

  return createLogger({
    format: combine(colorize(), timestamp(), logFormat),
    transports: [
      new transports.Console({
        format: format.combine(format.label({ label }), logFormat),
      }),
      new transports.File({
        filename: path.join("logs", `${label.toLowerCase()}.log`),
        format: combine(format.uncolorize(), logFormat),
      }),
      new transports.File({
        filename: path.join("logs", "combined.log"),
        format: combine(
          format.uncolorize(), 
          format.label({ label }), 
          combinedLogFormat
        ),
      }),
    ],
  });
};

module.exports = { createCustomLogger };
