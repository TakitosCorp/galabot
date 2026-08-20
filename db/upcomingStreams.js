/**
 * @module db/upcomingStreams
 * @description
 * Persistence helpers for the `upcoming_streams` table. Rows represent future
 * Twitch schedule segments and YouTube upcoming streams that have not yet begun.
 * They are upserted on every schedule sync and deleted automatically once their
 * start time passes, keeping the table current with no manual cleanup.
 *
 * All timestamps are stored as ISO-8601 TEXT strings. Comparisons against the
 * current time use `new Date().toISOString()` — ISO-8601 sorts lexicographically
 * in date order, so plain string comparisons work correctly in Kysely without any
 * SQLite `datetime()` function.
 *
 * @typedef {import('../utils/core/types').UpcomingStreamRow} UpcomingStreamRow
 */

import { db } from "./database.js";
import { dbLog } from "../utils/core/loggers.js";

/**
 * Insert or replace an upcoming stream row. Uses SQLite's INSERT OR REPLACE
 * semantics so re-syncing the schedule is idempotent and reschedules are
 * reflected automatically.
 *
 * `scheduledStartTs` is the Unix timestamp (seconds) derived from `scheduledStart`.
 * It is stored separately so the context formatter can emit Discord timestamp
 * markdown (`<t:TIMESTAMP:F>`) without re-parsing the ISO-8601 string.
 *
 * @async
 * @param {Object} data - Row values to persist.
 * @param {string} data.id - Twitch segment UUID or YouTube videoId (primary key).
 * @param {("twitch"|"youtube")} data.provider - Source platform.
 * @param {string} data.title - Stream title.
 * @param {string} data.scheduledStart - ISO-8601 scheduled start time.
 * @param {number} data.scheduledStartTs - Unix timestamp (seconds) of the start time.
 * @param {string|null} data.scheduledEnd - ISO-8601 scheduled end time, or null.
 * @param {string} data.url - Watch URL (YouTube) or channel URL (Twitch).
 * @param {string|null} data.category - Game/category name, or null.
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
export async function upsertUpcomingStream(data) {
  const {
    id,
    provider,
    title,
    scheduledStart,
    scheduledStartTs,
    scheduledEnd,
    url,
    category,
  } = data;
  dbLog("debug", "upcomingStreams:upsertUpcomingStream", { id, provider });
  try {
    await db
      .insertInto("upcoming_streams")
      .values({
        id,
        provider,
        title,
        scheduled_start: scheduledStart,
        scheduled_start_ts: scheduledStartTs,
        scheduled_end: scheduledEnd ?? null,
        url,
        category: category ?? null,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          provider,
          title,
          scheduled_start: scheduledStart,
          scheduled_start_ts: scheduledStartTs,
          scheduled_end: scheduledEnd ?? null,
          url,
          category: category ?? null,
        }),
      )
      .execute();
  } catch (err) {
    dbLog("error", "upcomingStreams:upsertUpcomingStream failed", {
      id,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Return all upcoming streams whose scheduled start time is in the future,
 * ordered chronologically. Used to build AI context before each query.
 *
 * @async
 * @returns {Promise<UpcomingStreamRow[]>} Future stream rows, oldest first.
 * @throws {Error} When the SQLite read fails.
 */
export async function getAllUpcomingStreams() {
  dbLog("debug", "upcomingStreams:getAllUpcomingStreams");
  try {
    const now = new Date().toISOString();
    return await db
      .selectFrom("upcoming_streams")
      .selectAll()
      .where("scheduled_start", ">", now)
      .orderBy("scheduled_start", "asc")
      .execute();
  } catch (err) {
    dbLog("error", "upcomingStreams:getAllUpcomingStreams failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Delete a single upcoming stream row by its primary key. Used to remove
 * schedule segments that were cancelled or removed from the provider's API.
 *
 * @async
 * @param {string} id - Twitch segment UUID or YouTube videoId to delete.
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
export async function deleteUpcomingStream(id) {
  dbLog("debug", "upcomingStreams:deleteUpcomingStream", { id });
  try {
    await db.deleteFrom("upcoming_streams").where("id", "=", id).execute();
  } catch (err) {
    dbLog("error", "upcomingStreams:deleteUpcomingStream failed", {
      id,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Delete all rows whose scheduled start time is in the past. Called at the
 * beginning of every schedule sync to purge streams that have already begun
 * and are no longer relevant as future schedule context.
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
export async function deleteExpiredStreams() {
  dbLog("debug", "upcomingStreams:deleteExpiredStreams");
  try {
    const now = new Date().toISOString();
    await db
      .deleteFrom("upcoming_streams")
      .where("scheduled_start", "<", now)
      .execute();
  } catch (err) {
    dbLog("error", "upcomingStreams:deleteExpiredStreams failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Return all upcoming stream rows for a specific provider.
 * Used when pruning rows for streams that are no longer in the current
 * provider schedule (to avoid deleting the other provider's rows).
 *
 * @async
 * @param {("twitch"|"youtube")} provider - Platform to filter by.
 * @returns {Promise<UpcomingStreamRow[]>} All rows for the given provider.
 * @throws {Error} When the SQLite read fails.
 */
export async function getUpcomingStreamsByProvider(provider) {
  dbLog("debug", "upcomingStreams:getUpcomingStreamsByProvider", { provider });
  try {
    return await db
      .selectFrom("upcoming_streams")
      .selectAll()
      .where("provider", "=", provider)
      .execute();
  } catch (err) {
    dbLog("error", "upcomingStreams:getUpcomingStreamsByProvider failed", {
      provider,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}
