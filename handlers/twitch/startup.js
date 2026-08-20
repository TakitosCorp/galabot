/**
 * @module handlers/twitch/startup
 * @description
 * Wires Twurple's chat client and EventSub WebSocket listener:
 *  - Chat: routes every message through {@link module:handlers/twitch/eventData} and
 *    dispatches to either the interaction handler (commands prefixed `!` or `g!`)
 *    or the regular message handler.
 *  - EventSub: subscribes to `streamOnline` / `streamOffline` for the configured
 *    broadcaster and forwards events to the platform-specific stream handlers.
 */

import { twitchLog } from "../../utils/core/loggers.js";
import streamStartHandler from "../../events/twitch/streamStart.js";
import streamEndHandler from "../../events/twitch/streamEnd.js";
import messageHandler from "../../events/twitch/messageCreate.js";
import interactionHandler from "../../events/twitch/interactionCreate.js";
import { createEventData } from "./eventData.js";
import {
  syncTwitchScheduleEvents,
  syncTwitchUpcomingStreams,
} from "../../utils/discord/discordGuildEvents.js";
import { setStreamingStatus } from "../../utils/discord/discordPresence.js";
import { getActiveStream } from "../../db/streams.js";

/** Interval reference for the hourly Twitch schedule → Discord events sync. */
const TWITCH_SCHEDULE_SYNC_MS = 60 * 60 * 1000;

/**
 * Attach all chat + EventSub callbacks to the clients owned by `clientManager`.
 *
 * @async
 * @param {import('../clientManager')} clientManager
 * @returns {Promise<void>}
 */
export async function bootstrap(clientManager) {
  twitchLog("debug", "twitch:bootstrap start");
  const { twitchChatClient, twitchApiClient, twitchEventSubListener } =
    clientManager;
  const channelName = process.env.TWITCH_CHANNEL;
  const username = process.env.TWITCH_USERNAME;

  // Rehydrate state from DB if a stream was already live at boot
  const activeStream = await getActiveStream("twitch");
  if (activeStream) {
    twitchLog("info", "twitch:bootstrap rehydrated", {
      videoId: activeStream.id,
      title: activeStream.title,
    });
    // Set streaming presence if a stream is already live on boot
    setStreamingStatus(
      clientManager.discordClient,
      activeStream.title,
      `https://twitch.tv/${channelName.replace("#", "")}`,
    );
  }

  twitchChatClient.onConnect(() => {
    twitchLog("info", "twitch:chat connected", { username });
  });

  twitchChatClient.onDisconnect((manually, reason) => {
    const reasonMsg = reason
      ? `${reason.message || "No message"} (${reason.name})`
      : "Unknown reason";
    twitchLog("warn", "twitch:chat disconnected", {
      manually,
      reason: reasonMsg,
    });
    if (!manually) {
      twitchLog("info", "twitch:chat reconnect-pending");
    }
  });

  twitchChatClient.onMessage(async (channel, user, message, msg) => {
    const eventData = createEventData(channel, user, message, msg);
    twitchLog("debug", "twitch:chat message", {
      channel,
      user,
      command: message.startsWith("!") || message.startsWith("g!"),
      isSelf: eventData.self,
    });
    if (message.startsWith("!") || message.startsWith("g!")) {
      await interactionHandler(eventData, clientManager);
    } else {
      await messageHandler(eventData, clientManager);
    }
  });

  try {
    const user = await twitchApiClient.users.getUserByName(
      channelName.replace("#", ""),
    );
    if (user) {
      twitchEventSubListener.onStreamOnline(user.id, (event) => {
        twitchLog("info", "twitch:eventsub streamOnline", {
          broadcaster: event.broadcasterDisplayName,
          broadcasterId: event.broadcasterId,
        });
        streamStartHandler(event, clientManager);
      });

      twitchEventSubListener.onStreamOffline(user.id, (event) => {
        twitchLog("info", "twitch:eventsub streamOffline", {
          broadcaster: event.broadcasterDisplayName,
          broadcasterId: event.broadcasterId,
        });
        streamEndHandler(event, clientManager);
      });

      twitchLog("info", "twitch:eventsub subscribed", {
        broadcaster: user.displayName,
        broadcasterId: user.id,
      });
    } else {
      twitchLog("error", "twitch:eventsub user-not-found", { channelName });
    }
  } catch (error) {
    twitchLog("error", "twitch:eventsub setup failed", {
      err: error.message,
      stack: error.stack,
    });
  }

  // Initial Discord event sync + hourly refresh for upcoming Twitch schedule.
  syncTwitchScheduleEvents(clientManager).catch((err) => {
    twitchLog("error", "twitch:bootstrap scheduleSync failed", {
      err: err.message,
      stack: err.stack,
    });
  });

  // Sync upcoming streams to the DB for AI context (independent of DISCORD_EVENTS_ENABLED).
  syncTwitchUpcomingStreams(clientManager).catch((err) => {
    twitchLog("error", "twitch:bootstrap upcomingStreamsSync failed", {
      err: err.message,
      stack: err.stack,
    });
  });

  setInterval(() => {
    syncTwitchScheduleEvents(clientManager).catch((err) => {
      twitchLog("error", "twitch:scheduleSync interval failed", {
        err: err.message,
        stack: err.stack,
      });
    });
    syncTwitchUpcomingStreams(clientManager).catch((err) => {
      twitchLog("error", "twitch:upcomingStreamsSync interval failed", {
        err: err.message,
        stack: err.stack,
      });
    });
  }, TWITCH_SCHEDULE_SYNC_MS);

  twitchLog("info", "twitch:bootstrap complete");
}
