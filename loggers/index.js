const { createCustomLogger } = require("./config");

const systemLogger = createCustomLogger("SYSTEM", "system.log");

const workflowLogger = createCustomLogger("WORKFLOW", "workflows.log");

const streamLogger = createCustomLogger("STREAM", "streams.log");

const notificationLogger = createCustomLogger("NOTIFICATION", "notifications.log");

const workflowUpdateLogger = createCustomLogger("WORKFLOW_UPDATE", "workflow_updates.log");

const workflowCheckLogger = createCustomLogger("WORKFLOW_CHECK", "workflow_checks.log");

module.exports = {
  systemLogger,
  workflowLogger,
  streamLogger,
  notificationLogger,
  workflowUpdateLogger,
  workflowCheckLogger,
};
