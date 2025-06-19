const { createCustomLogger } = require("./config");

module.exports = {
  // Loggers del sistema
  systemLogger: createCustomLogger("SYSTEM"),

  // Loggers para flujos de trabajo
  workflowUpdateLogger: createCustomLogger("WORKFLOW-UPDATE"),
  workflowCheckLogger: createCustomLogger("WORKFLOW-CHECK"),
  workflowNotifyLogger: createCustomLogger("WORKFLOW-NOTIFY"),

  // Loggers para verificación de streams
  streamLogger: createCustomLogger("STREAM"),
  liveCheckLogger: createCustomLogger("LIVE-CHECK"),
  streamDataLogger: createCustomLogger("STREAM-DATA"),

  // Loggers para notificaciones
  notificationLogger: createCustomLogger("NOTIFICATION"),
  embedLogger: createCustomLogger("EMBED"),

  // Loggers para API y conexiones externas
  youtubeApiLogger: createCustomLogger("YOUTUBE-API"),
};
