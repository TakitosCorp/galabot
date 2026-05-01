require("dotenv").config({ quiet: true });
const clientManager = require("./clientManager");
const { sysLog } = require("./utils/loggers");

const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "DISCORD_ID",
  "GALA_DISCORD_ID",
  "TWITCH_CHANNEL",
  "TWITCH_USERNAME",
  "DISCORD_NOTIFICATION_CHANNEL",
  "POST_DATA_WEBHOOK",
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

validateEnv();

const manager = new clientManager();

manager.initialize().catch((error) => {
  sysLog("error", `Critical failure initializing clientManager: ${error.stack}`);
  process.exit(1);
});
