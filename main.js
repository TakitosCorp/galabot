require("dotenv").config({ quiet: true });
const clientManager = require("./clientManager");
const { sysLog } = require("./utils/loggers");

const manager = new clientManager();

manager.initialize().catch((error) => {
  sysLog("error", `Critical failure initializing clientManager: ${error.stack}`);
  process.exit(1);
});
