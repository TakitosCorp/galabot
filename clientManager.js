/**
 * @module clientManager
 * @description
 * Lifecycle owner for every platform client the bot uses (Discord gateway client,
 * Twitch chat + Helix + EventSub, YouTube polling intervals). Holds the only
 * reference to each runtime client so handlers, commands and utilities can reach
 * them by accepting a `clientManager` argument.
 *
 * Per-platform initialization is gated by `ENABLE_DISCORD` / `ENABLE_TWITCH` /
 * `ENABLE_YOUTUBE` env vars (default: enabled). Graceful shutdown is wired to
 * `SIGTERM` and `SIGINT`.
 */

"use strict";

const {
  Client: DiscordClient,
  GatewayIntentBits,
  Events,
} = require("discord.js");

const { initialize: dbInitialize } = require("./db/database");
const { bootstrap: bootstrapDiscord } = require("./handlers/discord/startup");
const { discordLog, twitchLog, sysLog } = require("./utils/loggers");

/**
 * Owns and orchestrates every long-lived platform client.
 * @class
 */
class clientManager {
  /**
   * Initialize an empty manager. No platform connections are opened until
   * {@link clientManager#initialize} is called.
   */
  constructor() {
    /** @type {import('discord.js').Client|null} */
    this.discordClient = null;
    /** @type {import('@twurple/chat').ChatClient|null} */
    this.twitchChatClient = null;
    /** @type {import('@twurple/api').ApiClient|null} */
    this.twitchApiClient = null;
    /** @type {import('@twurple/eventsub-ws').EventSubWsListener|null} */
    this.twitchEventSubListener = null;
    /**
     * Active YouTube polling timers, retained so {@link clientManager#shutdown}
     * can clear them.
     * @type {NodeJS.Timeout[]}
     */
    this.youtubeIntervals = [];
  }

  /**
   * Initialize the database, then bring up every enabled platform in sequence.
   * Registers SIGTERM/SIGINT handlers so the process can shut down cleanly.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Any unrecoverable platform-init error is rethrown to the caller.
   */
  async initialize() {
    sysLog("info", "clientManager:initialize start");
    await dbInitialize();
    sysLog("info", "clientManager:db ready");

    const discordEnabled = process.env.ENABLE_DISCORD !== "false";
    const twitchEnabled = process.env.ENABLE_TWITCH !== "false";
    const youtubeEnabled = process.env.ENABLE_YOUTUBE !== "false";

    sysLog("debug", "clientManager:platform-flags", {
      discordEnabled,
      twitchEnabled,
      youtubeEnabled,
    });

    if (discordEnabled) {
      await this.initializeDiscord();
    } else {
      sysLog("info", "clientManager:discord disabled, skipping");
    }

    if (twitchEnabled) {
      await this.initializeTwitch();
    } else {
      sysLog("info", "clientManager:twitch disabled, skipping");
    }

    if (youtubeEnabled) {
      await this.initializeYoutube();
    } else {
      sysLog("info", "clientManager:youtube disabled, skipping");
    }

    if (!discordEnabled && !twitchEnabled && !youtubeEnabled) {
      sysLog("warn", "clientManager:no-platforms-enabled");
    }

    process.once("SIGTERM", () => this.shutdown("SIGTERM"));
    process.once("SIGINT", () => this.shutdown("SIGINT"));
    sysLog("info", "clientManager:initialize complete");
  }

  /**
   * Spin up the discord.js client, register events/commands via the bootstrap
   * helper, and resolve once the gateway connection emits `ClientReady`.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} On login failure (e.g. invalid token).
   */
  async initializeDiscord() {
    sysLog("debug", "clientManager:initializeDiscord start");
    this.discordClient = new DiscordClient({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    await bootstrapDiscord(this.discordClient, this);

    return new Promise((resolve, reject) => {
      this.discordClient.once(Events.ClientReady, () => {
        discordLog("info", "discord:ready", {
          tag: this.discordClient.user.tag,
          id: this.discordClient.user.id,
        });
        resolve();
      });

      this.discordClient.login(process.env.DISCORD_TOKEN).catch((err) => {
        sysLog("error", "discord:login failed", {
          err: err.message,
          stack: err.stack,
        });
        reject(err);
      });
    });
  }

  /**
   * Refresh Twitch credentials, construct chat + Helix + EventSub clients,
   * register handlers and connect. Twurple modules are required lazily so the
   * bot can boot Discord-only without paying their startup cost.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} When token refresh, EventSub start, or chat connect fails.
   */
  async initializeTwitch() {
    sysLog("debug", "clientManager:initializeTwitch start");
    const { ChatClient: TwitchChatClient } = require("@twurple/chat");
    const { StaticAuthProvider } = require("@twurple/auth");
    const { ApiClient } = require("@twurple/api");
    const { EventSubWsListener } = require("@twurple/eventsub-ws");
    const { bootstrap: bootstrapTwitch } = require("./handlers/twitch/startup");
    const { getValidTwitchConfig } = require("./utils/twitchToken");

    try {
      const twitchConfig = await getValidTwitchConfig();
      twitchLog("debug", "twitch:auth ready", {
        clientIdSet: Boolean(twitchConfig.CLIENT_ID),
        validUntil: twitchConfig.VALID_UNTIL,
      });
      const authProvider = new StaticAuthProvider(
        twitchConfig.CLIENT_ID,
        twitchConfig.ACCESS_TOKEN,
      );

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

      this.twitchEventSubListener = new EventSubWsListener({
        apiClient: this.twitchApiClient,
      });

      await bootstrapTwitch(this);

      await this.twitchChatClient.connect();
      await this.twitchEventSubListener.start();

      twitchLog("info", "twitch:initialized", {
        channel: process.env.TWITCH_CHANNEL,
      });
    } catch (error) {
      sysLog("error", "twitch:initialize failed", {
        err: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Bootstrap the YouTube polling subsystem. Polling intervals are stored on
   * `this.youtubeIntervals` so they can be cleared in {@link clientManager#shutdown}.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} When the YouTube bootstrap helper rejects.
   */
  async initializeYoutube() {
    sysLog("debug", "clientManager:initializeYoutube start");
    const {
      bootstrap: bootstrapYoutube,
    } = require("./handlers/youtube/startup");
    const { youtubeLog } = require("./utils/loggers");
    try {
      await bootstrapYoutube(this);
      youtubeLog("info", "youtube:initialized");
    } catch (error) {
      sysLog("error", "youtube:initialize failed", {
        err: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Tear everything down in a deterministic order: stop pollers, close the
   * Puppeteer browser, clear YouTube intervals, then disconnect platform clients.
   * Exits the process with code 0 on success, 1 on failure.
   *
   * @async
   * @param {("SIGTERM"|"SIGINT"|string)} signal - The signal that triggered shutdown (logged for diagnostics).
   * @returns {Promise<void>} Never resolves; the process exits before resolution.
   */
  async shutdown(signal) {
    sysLog("info", "clientManager:shutdown start", { signal });
    try {
      const { stopAllViewersIntervals } = require("./utils/twitchViews");
      const { closeBrowser } = require("./utils/imageGenerator");

      stopAllViewersIntervals();
      sysLog("debug", "clientManager:shutdown viewers-stopped");

      await closeBrowser();
      sysLog("debug", "clientManager:shutdown browser-closed");

      const intervalCount = this.youtubeIntervals.length;
      for (const interval of this.youtubeIntervals) clearInterval(interval);
      this.youtubeIntervals = [];
      sysLog("debug", "clientManager:shutdown youtube-intervals-cleared", {
        intervalCount,
      });

      if (this.discordClient) {
        this.discordClient.destroy();
        sysLog("debug", "clientManager:shutdown discord-destroyed");
      }
      if (this.twitchChatClient) {
        await this.twitchChatClient.quit().catch(() => {});
        sysLog("debug", "clientManager:shutdown twitch-chat-quit");
      }
      if (this.twitchEventSubListener) {
        this.twitchEventSubListener.stop();
        sysLog("debug", "clientManager:shutdown eventsub-stopped");
      }

      sysLog("info", "clientManager:shutdown complete");
      process.exit(0);
    } catch (err) {
      sysLog("error", "clientManager:shutdown failed", {
        err: err.message,
        stack: err.stack,
      });
      process.exit(1);
    }
  }
}

module.exports = clientManager;
