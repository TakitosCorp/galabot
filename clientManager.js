const { Client: DiscordClient, GatewayIntentBits } = require("discord.js");
const { ChatClient: TwitchChatClient } = require("@twurple/chat");
const { StaticAuthProvider } = require("@twurple/auth");
const { ApiClient } = require("@twurple/api");
const { EventSubWsListener } = require("@twurple/eventsub-ws");

const { initialize: dbInitialize } = require("./db/database");
const { bootstrap: bootstrapDiscord } = require("./handlers/discord/startup");
const { bootstrap: bootstrapTwitch } = require("./handlers/twitch/startup");
const { getValidTwitchConfig } = require("./utils/twitchToken");
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
    sysLog("info", "Base de datos inicializada.");

    await this.initializeDiscord();

    await this.initializeTwitch();
  }

  async initializeDiscord() {
    this.discordClient = new DiscordClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });

    await bootstrapDiscord(this.discordClient, this);

    return new Promise((resolve, reject) => {
      this.discordClient.once("ready", () => {
        discordLog("info", `Cliente de Discord conectado como ${this.discordClient.user.tag}`);
        resolve();
      });

      this.discordClient.login(process.env.DISCORD_TOKEN).catch((err) => {
        sysLog("error", `Fallo en el login de Discord: ${err}`);
        reject(err);
      });
    });
  }

  async initializeTwitch() {
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

      twitchLog("info", "Cliente de Twitch y EventSub inicializados y conectados.");
    } catch (error) {
      sysLog("error", `No se pudo inicializar el cliente de Twitch: ${error.stack}`);
      throw error;
    }
  }
}

module.exports = clientManager;
