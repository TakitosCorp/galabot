/**
 * @module utils/discordGuildEvents
 * @description
 * Helpers for creating, syncing, activating, completing, and cleaning up
 * Discord Guild Scheduled Events from upcoming Twitch and YouTube streams.
 * Also exports {@link syncTwitchUpcomingStreams} which maintains the
 * `upcoming_streams` DB table for AI context injection — this sync runs
 * independently of `DISCORD_EVENTS_ENABLED`.
 *
 * @typedef {import('./types').DiscordScheduledEventRow} DiscordScheduledEventRow
 * @typedef {import('./types').ScheduleSegment} ScheduleSegment
 */

"use strict";

const {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
} = require("discord.js");
const { discordLog } = require("../core/loggers");
const { cleanStreamTitle } = require("../helpers/streamTitleCleaner");
const {
  insertDiscordEvent,
  getDiscordEventBySourceId,
  updateDiscordEvent,
  getDiscordEventsByProvider,
  deleteDiscordEvent,
} = require("../../db/discordEvents");
const { getStreamerScheduleThisWeek } = require("../twitch/twitchSchedule");
const {
  upsertUpcomingStream,
  deleteExpiredStreams,
  deleteUpcomingStream,
  getUpcomingStreamsByProvider,
} = require("../../db/upcomingStreams");

/**
 * Create or update a Discord Guild Scheduled Event for an upcoming stream.
 * Detects reschedules and renames. Will delete and recreate the event if it
 * was prematurely marked as Completed or Canceled.
 *
 * @async
 * @param {import('discord.js').Client|null} discordClient - The Discord client.
 * @param {Object} opts - Event configuration options.
 * @param {("twitch"|"youtube")} opts.provider - The platform provider.
 * @param {string} opts.sourceId - The provider's unique stream or video ID.
 * @param {string} opts.title - The stream title.
 * @param {string} opts.streamUrl - The URL to watch the stream.
 * @param {string|null} opts.scheduledStart - ISO-8601 start time.
 * @param {string|null} [opts.scheduledEnd] - ISO-8601 end time (defaults to start + 3h).
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
      { sourceId },
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
        { channelId },
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

    let existing = await getDiscordEventBySourceId(sourceId);
    let fetchedEvent = null;

    if (existing) {
      fetchedEvent = await channel.guild.scheduledEvents
        .fetch(existing.discordEventId)
        .catch(() => null);

      const startChanged =
        !existing.scheduledStart ||
        new Date(existing.scheduledStart).getTime() !== startDate.getTime();
      const isFinished =
        fetchedEvent &&
        (fetchedEvent.status === GuildScheduledEventStatus.Completed ||
          fetchedEvent.status === GuildScheduledEventStatus.Canceled);
      const isActive =
        fetchedEvent?.status === GuildScheduledEventStatus.Active;

      if (!fetchedEvent || isFinished || isActive) {
        if (fetchedEvent) {
          discordLog(
            "info",
            "discordGuildEvents:deleting old event for recreation",
            { sourceId, eventId: existing.discordEventId },
          );
          await channel.guild.scheduledEvents
            .delete(existing.discordEventId)
            .catch((err) => {
              discordLog("warn", "discordGuildEvents:delete old event failed", {
                err: err.message,
              });
            });
        }
        await deleteDiscordEvent(sourceId);
        existing = undefined;
      }
    }

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
        { sourceId },
      );
      return;
    }

    const editPayload = {
      name: eventName,
      entityMetadata: { location: streamUrl },
      description: cleanedTitle,
    };

    if (
      fetchedEvent &&
      fetchedEvent.status === GuildScheduledEventStatus.Scheduled
    ) {
      editPayload.scheduledStartTime = startDate;
      editPayload.scheduledEndTime = endDate;
    } else if (
      fetchedEvent &&
      fetchedEvent.status === GuildScheduledEventStatus.Active
    ) {
      editPayload.scheduledEndTime = endDate;
    }

    await channel.guild.scheduledEvents.edit(
      existing.discordEventId,
      editPayload,
    );

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
    });
  }
}

/**
 * Update a Discord Guild Scheduled Event status to Active.
 * Called when a stream physically goes live.
 *
 * @async
 * @param {import('discord.js').Client|null} discordClient - The Discord client.
 * @param {string} sourceId - The provider's unique stream or video ID.
 * @returns {Promise<void>}
 */
async function activateGuildStreamEvent(discordClient, sourceId) {
  if (process.env.DISCORD_EVENTS_ENABLED !== "true") return;
  if (!discordClient || !discordClient.isReady()) return;

  try {
    const row = await getDiscordEventBySourceId(sourceId);
    if (!row) return;

    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) return;

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.guild) return;

    await channel.guild.scheduledEvents.edit(row.discordEventId, {
      status: GuildScheduledEventStatus.Active,
    });

    discordLog("info", "discordGuildEvents:activate ok", {
      sourceId,
      eventId: row.discordEventId,
    });
  } catch (err) {
    discordLog("error", "discordGuildEvents:activate failed", {
      sourceId,
      err: err.message,
    });
  }
}

/**
 * Update a Discord Guild Scheduled Event status to Completed.
 * Called when a stream physically ends.
 *
 * @async
 * @param {import('discord.js').Client|null} discordClient - The Discord client.
 * @param {string} sourceId - The provider's unique stream or video ID.
 * @returns {Promise<void>}
 */
async function completeGuildStreamEvent(discordClient, sourceId) {
  if (process.env.DISCORD_EVENTS_ENABLED !== "true") return;
  if (!discordClient || !discordClient.isReady()) return;

  try {
    const row = await getDiscordEventBySourceId(sourceId);
    if (!row) return;

    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) return;

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.guild) return;

    await channel.guild.scheduledEvents.edit(row.discordEventId, {
      status: GuildScheduledEventStatus.Completed,
    });

    discordLog("info", "discordGuildEvents:complete ok", {
      sourceId,
      eventId: row.discordEventId,
    });
  } catch (err) {
    discordLog("error", "discordGuildEvents:complete failed", {
      sourceId,
      err: err.message,
    });
  }
}

/**
 * Delete Discord Guild Scheduled Events whose source streams are no longer in
 * the current schedule.
 *
 * @async
 * @param {import('discord.js').Client|null} discordClient - The Discord client.
 * @param {("twitch"|"youtube")} provider - The platform provider.
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
    });
  }
}

/**
 * Fetch all upcoming Twitch schedule segments and sync them to Discord Guild Scheduled Events.
 *
 * @async
 * @param {import('../clientManager')} clientManager - The client manager instance.
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
    });
  }
}

/**
 * Fetch all upcoming Twitch schedule segments and sync them to the
 * `upcoming_streams` DB table so the AI can answer schedule questions.
 * Runs independently of `DISCORD_EVENTS_ENABLED` — the DB table is always kept
 * current as long as Twitch is enabled.
 *
 * @async
 * @param {import('../../clientManager')} clientManager - The client manager instance.
 * @returns {Promise<void>}
 */
async function syncTwitchUpcomingStreams(clientManager) {
  const { twitchApiClient } = clientManager;
  if (!twitchApiClient) return;

  const username = process.env.TWITCH_CHANNEL;
  const streamUrl =
    process.env.TWITCH_URL || `https://www.twitch.tv/${username}`;

  if (!username) {
    discordLog(
      "warn",
      "discordGuildEvents:syncTwitchUpcomingStreams no-username",
    );
    return;
  }

  discordLog("debug", "discordGuildEvents:syncTwitchUpcomingStreams start", {
    username,
  });

  try {
    const segments = await getStreamerScheduleThisWeek(
      username,
      twitchApiClient,
    );

    await deleteExpiredStreams();

    const currentIds = new Set(segments.map((s) => s.id));

    for (const seg of segments) {
      await upsertUpcomingStream({
        id: seg.id,
        provider: "twitch",
        title: seg.title,
        scheduledStart: seg.start,
        scheduledStartTs: Math.floor(new Date(seg.start).getTime() / 1000),
        scheduledEnd: seg.end,
        url: streamUrl,
        category: seg.category,
      });
    }

    const existing = await getUpcomingStreamsByProvider("twitch");
    for (const row of existing) {
      if (!currentIds.has(row.id)) {
        await deleteUpcomingStream(row.id);
      }
    }

    discordLog(
      "info",
      "discordGuildEvents:syncTwitchUpcomingStreams complete",
      {
        count: segments.length,
      },
    );
  } catch (err) {
    discordLog("error", "discordGuildEvents:syncTwitchUpcomingStreams failed", {
      err: err.message,
      stack: err.stack,
    });
  }
}

module.exports = {
  createGuildStreamEvent,
  activateGuildStreamEvent,
  completeGuildStreamEvent,
  cleanupRemovedEvents,
  syncTwitchScheduleEvents,
  syncTwitchUpcomingStreams,
};
