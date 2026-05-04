/**
 * @module utils/discordGuildEvents
 * @description
 * Helpers for creating, syncing and cleaning up Discord Guild Scheduled Events
 * from upcoming Twitch and YouTube streams. Event creation is gated behind the
 * `DISCORD_EVENTS_ENABLED` env var (default: disabled) and requires the bot to
 * have the `MANAGE_EVENTS` permission in the target guild.
 *
 * Deduplication is handled via the `discord_scheduled_events` SQLite table —
 * each source id (Twitch segment UUID or YouTube videoId) is only ever used to
 * create one event. Cleanup compares the current schedule against DB rows and
 * deletes Discord events whose streams were removed or cancelled.
 *
 * @typedef {import('./types').DiscordScheduledEventRow} DiscordScheduledEventRow
 * @typedef {import('./types').ScheduleSegment} ScheduleSegment
 */

"use strict";

const {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} = require("discord.js");
const { discordLog } = require("./loggers");
const { cleanStreamTitle } = require("./streamTitleCleaner");
const {
  insertDiscordEvent,
  getDiscordEventBySourceId,
  updateDiscordEvent,
  getDiscordEventsByProvider,
  deleteDiscordEvent,
} = require("../db/discordEvents");
const { getStreamerScheduleThisWeek } = require("./twitchSchedule");

/**
 * Create or update a Discord Guild Scheduled Event for an upcoming stream.
 * Three outcomes are possible:
 *  - **New**: no DB row → create the event and persist it.
 *  - **Changed**: DB row exists but title, start, or end time differs → edit
 *    the existing Discord event and update the DB row.
 *  - **Unchanged**: DB row matches current schedule → skip.
 *
 * Derives the guild from `DISCORD_NOTIFICATION_CHANNEL`. External entity type
 * is used so no stage/voice channel is needed; Discord requires `scheduledEndTime`
 * for external events — defaults to `scheduledStart + 3 h` when not supplied.
 *
 * Set `DISCORD_EVENTS_ENABLED=true` to activate (off by default). The bot also
 * needs the `MANAGE_EVENTS` guild permission.
 *
 * @async
 * @param {import('discord.js').Client|null} discordClient
 * @param {Object} opts
 * @param {("twitch"|"youtube")} opts.provider
 * @param {string} opts.sourceId - Twitch segment UUID or YouTube videoId.
 * @param {string} opts.title - Stream title used for the event name.
 * @param {string} opts.streamUrl - Public stream URL set as the event location.
 * @param {string|null} opts.scheduledStart - ISO-8601 start time.
 * @param {string|null} [opts.scheduledEnd] - ISO-8601 end time; defaults to start + 3 h.
 * @returns {Promise<void>}
 */
async function createGuildStreamEvent(discordClient, opts) {
  if (process.env.DISCORD_EVENTS_ENABLED !== "true") return;
  if (!discordClient || !discordClient.isReady()) return;

  const { provider, sourceId, title, streamUrl, scheduledStart, scheduledEnd } =
    opts;

  discordLog("debug", "discordGuildEvents:createGuildStreamEvent enter", {
    provider,
    sourceId,
    title,
  });

  if (!scheduledStart) {
    discordLog(
      "warn",
      "discordGuildEvents:createGuildStreamEvent no-start-time",
      {
        sourceId,
      },
    );
    return;
  }

  const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
  if (!channelId) {
    discordLog(
      "warn",
      "discordGuildEvents:createGuildStreamEvent no-channel-id",
    );
    return;
  }

  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.guild) {
      discordLog(
        "warn",
        "discordGuildEvents:createGuildStreamEvent guild-not-found",
        {
          channelId,
        },
      );
      return;
    }

    const prefix = provider === "twitch" ? "[TWITCH]" : "[YT]";
    const cleanedTitle = cleanStreamTitle(title);
    const eventName = `${prefix} ${cleanedTitle}`;
    const startDate = new Date(scheduledStart);
    const resolvedEnd = scheduledEnd
      ? scheduledEnd
      : new Date(startDate.getTime() + 3 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(resolvedEnd);

    const existing = await getDiscordEventBySourceId(sourceId);

    if (!existing) {
      const event = await channel.guild.scheduledEvents.create({
        name: eventName,
        scheduledStartTime: startDate,
        scheduledEndTime: endDate,
        entityType: GuildScheduledEventEntityType.External,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityMetadata: { location: streamUrl },
        description: cleanedTitle,
      });

      await insertDiscordEvent({
        sourceId,
        provider,
        discordEventId: event.id,
        createdAt: new Date().toISOString(),
        scheduledStart,
        scheduledEnd: resolvedEnd,
        title: cleanedTitle,
      });

      discordLog("info", "discordGuildEvents:createGuildStreamEvent created", {
        provider,
        sourceId,
        eventName,
        discordEventId: event.id,
      });
      return;
    }

    // Detect reschedules and renames using epoch comparison to avoid ISO string drift.
    const startChanged =
      !existing.scheduledStart ||
      new Date(existing.scheduledStart).getTime() !== startDate.getTime();
    const endChanged =
      !existing.scheduledEnd ||
      new Date(existing.scheduledEnd).getTime() !== endDate.getTime();
    const titleChanged = existing.title !== cleanedTitle;

    if (!startChanged && !endChanged && !titleChanged) {
      discordLog(
        "debug",
        "discordGuildEvents:createGuildStreamEvent skip (unchanged)",
        {
          sourceId,
        },
      );
      return;
    }

    await channel.guild.scheduledEvents.edit(existing.discordEventId, {
      name: eventName,
      scheduledStartTime: startDate,
      scheduledEndTime: endDate,
      entityMetadata: { location: streamUrl },
      description: cleanedTitle,
    });

    await updateDiscordEvent(sourceId, {
      scheduledStart,
      scheduledEnd: resolvedEnd,
      title: cleanedTitle,
    });

    discordLog("info", "discordGuildEvents:createGuildStreamEvent updated", {
      provider,
      sourceId,
      eventName,
      startChanged,
      endChanged,
      titleChanged,
      discordEventId: existing.discordEventId,
    });
  } catch (err) {
    discordLog("error", "discordGuildEvents:createGuildStreamEvent failed", {
      provider,
      sourceId,
      err: err.message,
      stack: err.stack,
    });
  }
}

/**
 * Delete Discord Guild Scheduled Events whose source streams are no longer in
 * the current schedule. Compares `currentSourceIds` against every DB row for
 * `provider` and removes stale entries from both Discord and the DB.
 *
 * Errors from the Discord API (e.g. event already completed or not found) are
 * logged as warnings — the DB row is always cleaned up regardless so the dedup
 * table stays accurate.
 *
 * @async
 * @param {import('discord.js').Client|null} discordClient
 * @param {("twitch"|"youtube")} provider
 * @param {string[]} currentSourceIds - Source ids still present in the live schedule.
 * @returns {Promise<void>}
 */
async function cleanupRemovedEvents(discordClient, provider, currentSourceIds) {
  if (process.env.DISCORD_EVENTS_ENABLED !== "true") return;
  if (!discordClient || !discordClient.isReady()) return;

  discordLog("debug", "discordGuildEvents:cleanupRemovedEvents start", {
    provider,
    currentCount: currentSourceIds.length,
  });

  try {
    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) return;

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.guild) return;
    const guild = channel.guild;

    const existingRows = await getDiscordEventsByProvider(provider);
    const currentSet = new Set(currentSourceIds);

    for (const row of existingRows) {
      if (currentSet.has(row.sourceId)) continue;

      try {
        await guild.scheduledEvents.delete(row.discordEventId);
        discordLog("info", "discordGuildEvents:cleanupRemovedEvents deleted", {
          provider,
          sourceId: row.sourceId,
          discordEventId: row.discordEventId,
        });
      } catch (deleteErr) {
        discordLog(
          "warn",
          "discordGuildEvents:cleanupRemovedEvents discord-delete failed",
          {
            provider,
            sourceId: row.sourceId,
            discordEventId: row.discordEventId,
            err: deleteErr.message,
          },
        );
      }

      await deleteDiscordEvent(row.sourceId);
    }
  } catch (err) {
    discordLog("error", "discordGuildEvents:cleanupRemovedEvents failed", {
      provider,
      err: err.message,
      stack: err.stack,
    });
  }
}

/**
 * Fetch all upcoming Twitch schedule segments, create Discord Guild Scheduled
 * Events for any that do not already have one, and delete events for segments
 * that were removed from the schedule. Called at Twitch bootstrap and then on
 * an hourly interval.
 *
 * @async
 * @param {import('../clientManager')} clientManager
 * @returns {Promise<void>}
 */
async function syncTwitchScheduleEvents(clientManager) {
  if (process.env.DISCORD_EVENTS_ENABLED !== "true") return;

  const { discordClient, twitchApiClient } = clientManager;
  if (!discordClient || !discordClient.isReady()) return;
  if (!twitchApiClient) return;

  const username = process.env.TWITCH_CHANNEL;
  const streamUrl =
    process.env.TWITCH_URL || `https://www.twitch.tv/${username}`;

  if (!username) {
    discordLog(
      "warn",
      "discordGuildEvents:syncTwitchScheduleEvents no-username",
    );
    return;
  }

  discordLog("debug", "discordGuildEvents:syncTwitchScheduleEvents start", {
    username,
  });

  try {
    const segments = await getStreamerScheduleThisWeek(
      username,
      twitchApiClient,
    );
    discordLog("info", "discordGuildEvents:syncTwitchScheduleEvents fetched", {
      count: segments.length,
    });

    const currentSourceIds = [];
    for (const seg of segments) {
      currentSourceIds.push(seg.id);
      await createGuildStreamEvent(discordClient, {
        provider: "twitch",
        sourceId: seg.id,
        title: seg.title,
        streamUrl,
        scheduledStart: seg.start,
        scheduledEnd: seg.end,
      });
    }

    await cleanupRemovedEvents(discordClient, "twitch", currentSourceIds);
  } catch (err) {
    discordLog("error", "discordGuildEvents:syncTwitchScheduleEvents failed", {
      err: err.message,
      stack: err.stack,
    });
  }
}

module.exports = {
  createGuildStreamEvent,
  cleanupRemovedEvents,
  syncTwitchScheduleEvents,
};
