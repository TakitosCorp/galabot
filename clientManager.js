const { Client: DiscordClient, GatewayIntentBits } = require("discord.js");

const { initialize: dbInitialize } = require("./db/database");
const { bootstrap: bootstrapDiscord } = require("./handlers/discord/startup");
const { discordLog, twitchLog, sysLog } = require("./utils/loggers");

class clientManager {
  constructor() {
    this.discordClient = null;
    this.twitchChatClient = null;
    this.twitchApiClient = null;
    this.twitchEventSubListener = null;
  }

  async initialize() {
    await dbInitialize();
    sysLog("info", "Database initialized.");

    const discordEnabled = process.env.ENABLE_DISCORD !== "false";
    const twitchEnabled = process.env.ENABLE_TWITCH !== "false";

    if (discordEnabled) {
      await this.initializeDiscord();
    } else {
      sysLog("info", "Discord platform disabled, skipping.");
    }

    if (twitchEnabled) {
      await this.initializeTwitch();
    } else {
      sysLog("info", "Twitch platform disabled, skipping.");
    }

    if (!discordEnabled && !twitchEnabled) {
      sysLog("warn", "All platforms are disabled. Bot has nothing to do.");
    }

    process.once("SIGTERM", () => this.shutdown("SIGTERM"));
    process.once("SIGINT", () => this.shutdown("SIGINT"));
  }

  async initializeDiscord() {
    this.discordClient = new DiscordClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });

    await bootstrapDiscord(this.discordClient, this);

    return new Promise((resolve, reject) => {
      this.discordClient.once("ready", () => {
        discordLog("info", `Discord client connected as ${this.discordClient.user.tag}`);
        resolve();
      });

      this.discordClient.login(process.env.DISCORD_TOKEN).catch((err) => {
        sysLog("error", `Discord login failed: ${err}`);
        reject(err);
      });
    });
  }

  async initializeTwitch() {
    const { ChatClient: TwitchChatClient } = require("@twurple/chat");
    const { StaticAuthProvider } = require("@twurple/auth");
    const { ApiClient } = require("@twurple/api");
    const { EventSubWsListener } = require("@twurple/eventsub-ws");
    const { bootstrap: bootstrapTwitch } = require("./handlers/twitch/startup");
    const { getValidTwitchConfig } = require("./utils/twitchToken");

    try {
      const twitchConfig = await getValidTwitchConfig();
      const authProvider = new StaticAuthProvider(twitchConfig.CLIENT_ID, twitchConfig.ACCESS_TOKEN);

      this.twitchApiClient = new ApiClient({ authProvider });

      this.twitchChatClient = new TwitchChatClient({
        authProvider,
        channels: [process.env.TWITCH_CHANNEL],
        ssl: true,
        rejoinChannelsOnReconnect: true,
        webSocket: true,
        connectionOptions: {
          reconnect: true,
          maxRetries: Number.MAX_SAFE_INTEGER,
        },
      });

      this.twitchEventSubListener = new EventSubWsListener({ apiClient: this.twitchApiClient });

      await bootstrapTwitch(this);

      await this.twitchChatClient.connect();
      await this.twitchEventSubListener.start();

      twitchLog("info", "Twitch client and EventSub initialized and connected.");
    } catch (error) {
      sysLog("error", `Failed to initialize Twitch client: ${error.stack}`);
      throw error;
    }
  }

  async shutdown(signal) {
    sysLog("info", `Received ${signal}. Shutting down gracefully…`);
    try {
      const { stopAllViewersIntervals } = require("./utils/twitchViews");
      const { closeBrowser } = require("./utils/imageGenerator");

      stopAllViewersIntervals();
      await closeBrowser();

      if (this.discordClient) this.discordClient.destroy();
      if (this.twitchChatClient) await this.twitchChatClient.quit().catch(() => {});
      if (this.twitchEventSubListener) this.twitchEventSubListener.stop();

      sysLog("info", "Shutdown complete.");
      process.exit(0);
    } catch (err) {
      sysLog("error", `Error during shutdown: ${err.stack}`);
      process.exit(1);
    }
  }
}

module.exports = clientManager;
