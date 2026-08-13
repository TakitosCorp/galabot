/**
 * @module db/discordEvents
 * @description
 * CRUD helpers for the `discord_scheduled_events` table — the dedup guard that
 * prevents duplicate Discord Guild Scheduled Events and the source-of-truth used
 * when cleaning up events whose streams were removed from the schedule. Every
 * helper logs at `debug` level on entry and rethrows on error so callers can
 * apply their own fallbacks.
 *
 * @typedef {import('../utils/core/types').DiscordScheduledEventRow} DiscordScheduledEventRow
 */

"use strict";

const { db } = require("./database");
const { dbLog } = require("../utils/core/loggers");

/**
 * Check whether a Discord Guild Scheduled Event has already been created for
 * the given provider-native source id.
 *
 * @async
 * @param {string} sourceId - Twitch segment UUID or YouTube videoId.
 * @returns {Promise<boolean>} True when a row already exists.
 * @throws {Error} When the SQLite read fails.
 */
async function discordEventExists(sourceId) {
  dbLog("debug", "discordEvents:exists", { sourceId });
  try {
    const row = await db
      .selectFrom("discord_scheduled_events")
      .select("source_id")
      .where("source_id", "=", sourceId)
      .executeTakeFirst();
    return Boolean(row);
  } catch (err) {
    dbLog("error", "discordEvents:exists failed", {
      sourceId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Persist a newly-created Discord Guild Scheduled Event. Stores the scheduled
 * start/end time and title so future syncs can detect reschedules.
 *
 * @async
 * @param {DiscordScheduledEventRow} row - Insert payload.
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
async function insertDiscordEvent(row) {
  dbLog("debug", "discordEvents:insertDiscordEvent", {
    sourceId: row.sourceId,
    provider: row.provider,
    discordEventId: row.discordEventId,
  });
  try {
    await db
      .insertInto("discord_scheduled_events")
      .values({
        source_id: row.sourceId,
        provider: row.provider,
        discord_event_id: row.discordEventId,
        created_at: row.createdAt,
        scheduled_start: row.scheduledStart ?? null,
        scheduled_end: row.scheduledEnd ?? null,
        title: row.title ?? null,
      })
      .execute();
  } catch (err) {
    dbLog("error", "discordEvents:insertDiscordEvent failed", {
      sourceId: row.sourceId,
      provider: row.provider,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Return the full persisted row for a source id, or `undefined` when not found.
 * Used by the reschedule-detection logic to compare stored times against the
 * current schedule.
 *
 * @async
 * @param {string} sourceId - Twitch segment UUID or YouTube videoId.
 * @returns {Promise<DiscordScheduledEventRow|undefined>}
 * @throws {Error} When the SQLite read fails.
 */
async function getDiscordEventBySourceId(sourceId) {
  dbLog("debug", "discordEvents:getDiscordEventBySourceId", { sourceId });
  try {
    const row = await db
      .selectFrom("discord_scheduled_events")
      .selectAll()
      .where("source_id", "=", sourceId)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      sourceId: row.source_id,
      provider: row.provider,
      discordEventId: row.discord_event_id,
      createdAt: row.created_at,
      scheduledStart: row.scheduled_start ?? null,
      scheduledEnd: row.scheduled_end ?? null,
      title: row.title ?? null,
    };
  } catch (err) {
    dbLog("error", "discordEvents:getDiscordEventBySourceId failed", {
      sourceId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Update the stored schedule metadata for an existing row after a Discord event
 * has been edited.
 *
 * @async
 * @param {string} sourceId - Twitch segment UUID or YouTube videoId.
 * @param {{ scheduledStart: string, scheduledEnd: string, title: string }} patch
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
async function updateDiscordEvent(sourceId, patch) {
  dbLog("debug", "discordEvents:updateDiscordEvent", { sourceId });
  try {
    await db
      .updateTable("discord_scheduled_events")
      .set({
        scheduled_start: patch.scheduledStart,
        scheduled_end: patch.scheduledEnd,
        title: patch.title,
      })
      .where("source_id", "=", sourceId)
      .execute();
  } catch (err) {
    dbLog("error", "discordEvents:updateDiscordEvent failed", {
      sourceId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Fetch all persisted Discord event rows for a given provider. Used by the
 * cleanup routine to detect source ids that are no longer scheduled.
 *
 * @async
 * @param {("twitch"|"youtube")} provider
 * @returns {Promise<DiscordScheduledEventRow[]>}
 * @throws {Error} When the SQLite read fails.
 */
async function getDiscordEventsByProvider(provider) {
  dbLog("debug", "discordEvents:getDiscordEventsByProvider", { provider });
  try {
    const rows = await db
      .selectFrom("discord_scheduled_events")
      .selectAll()
      .where("provider", "=", provider)
      .execute();
    return rows.map((r) => ({
      sourceId: r.source_id,
      provider: r.provider,
      discordEventId: r.discord_event_id,
      createdAt: r.created_at,
    }));
  } catch (err) {
    dbLog("error", "discordEvents:getDiscordEventsByProvider failed", {
      provider,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Remove a persisted event row after its Discord counterpart has been deleted
 * (or confirmed gone). Safe to call even if the row no longer exists.
 *
 * @async
 * @param {string} sourceId - Twitch segment UUID or YouTube videoId.
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
async function deleteDiscordEvent(sourceId) {
  dbLog("debug", "discordEvents:deleteDiscordEvent", { sourceId });
  try {
    await db
      .deleteFrom("discord_scheduled_events")
      .where("source_id", "=", sourceId)
      .execute();
  } catch (err) {
    dbLog("error", "discordEvents:deleteDiscordEvent failed", {
      sourceId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

module.exports = {
  discordEventExists,
  insertDiscordEvent,
  getDiscordEventBySourceId,
  updateDiscordEvent,
  getDiscordEventsByProvider,
  deleteDiscordEvent,
};
