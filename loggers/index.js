const { createCustomLogger } = require("./config");

const systemLogger = createCustomLogger("SYSTEM", "system.log");

const notificationLogger = createCustomLogger("NOTIFICATION", "notifications.log");

module.exports = {
  systemLogger,
  notificationLogger,
};
