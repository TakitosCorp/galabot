/**
 * @module db/streams
 * @description
 * CRUD helpers for the unified `streams` table — covers both Twitch streams and
 * YouTube live videos via the `provider` column. Every helper logs entry/exit at
 * `debug` level and routes errors through `dbLog('error', …)` while still
 * rethrowing so callers can decide on user-facing fallbacks.
 *
 * @typedef {import('../utils/types').StreamRow} StreamRow
 * @typedef {import('../utils/types').StreamInsert} StreamInsert
 */

"use strict";

const { db } = require("./database");
const { dbLog } = require("../utils/loggers");

/**
 * Insert a freshly-detected stream row. Caller is responsible for de-duplication
 * (use {@link streamExists} first when re-running announcements).
 *
 * @async
 * @param {StreamInsert} streamData - Insert payload. Optional fields default to NULL/0.
 * @returns {Promise<unknown>} The Kysely insert result.
 * @throws {Error} When the SQLite write fails.
 */
async function insertStream(streamData) {
  dbLog("debug", "streams:insertStream", {
    id: streamData.id,
    provider: streamData.provider,
  });
  try {
    return await db.transaction().execute(async (trx) => {
      return await trx
        .insertInto("streams")
        .values({
          id: streamData.id,
          provider: streamData.provider,
          timestamp: streamData.timestamp,
          title: streamData.title,
          viewers: streamData.viewers ?? 0,
          category: streamData.category ?? null,
          tags: streamData.tags ?? null,
          thumbnail: streamData.thumbnail ?? null,
          discMsgId: streamData.discMsgId || "",
        })
        .execute();
    });
  } catch (err) {
    dbLog("error", "streams:insertStream failed", {
      id: streamData.id,
      provider: streamData.provider,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Return the most recent in-progress stream for the given provider, or `null` if
 * none is live. "In progress" = row whose `end` column is still `NULL`.
 *
 * @async
 * @param {("twitch"|"youtube")} provider - Platform filter.
 * @returns {Promise<StreamRow|null>}
 * @throws {Error} When the SQLite read fails.
 */
async function getActiveStream(provider) {
  dbLog("debug", "streams:getActiveStream", { provider });
  try {
    return await db.transaction().execute(async (trx) => {
      const result = await trx
        .selectFrom("streams")
        .selectAll()
        .where("provider", "=", provider)
        .where("end", "is", null)
        .orderBy("timestamp", "desc")
        .executeTakeFirst();

      return result || null;
    });
  } catch (err) {
    dbLog("error", "streams:getActiveStream failed", {
      provider,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Return the most recent stream row for the given provider regardless of whether
 * it has ended yet.
 *
 * @async
 * @param {("twitch"|"youtube")} provider - Platform filter.
 * @returns {Promise<StreamRow|null>}
 * @throws {Error} When the SQLite read fails.
 */
async function getMostRecentStream(provider) {
  dbLog("debug", "streams:getMostRecentStream", { provider });
  try {
    return await db.transaction().execute(async (trx) => {
      const result = await trx
        .selectFrom("streams")
        .selectAll()
        .where("provider", "=", provider)
        .orderBy("timestamp", "desc")
        .executeTakeFirst();

      return result || null;
    });
  } catch (err) {
    dbLog("error", "streams:getMostRecentStream failed", {
      provider,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Look up a single stream by its provider-native id (Twitch stream id or YouTube videoId).
 *
 * @async
 * @param {string} streamId - Provider-native id stored in the `id` column.
 * @returns {Promise<StreamRow|null>}
 * @throws {Error} When the SQLite read fails.
 */
async function getStreamById(streamId) {
  dbLog("debug", "streams:getStreamById", { streamId });
  try {
    return await db.transaction().execute(async (trx) => {
      const result = await trx
        .selectFrom("streams")
        .selectAll()
        .where("id", "=", streamId)
        .executeTakeFirst();

      return result || null;
    });
  } catch (err) {
    dbLog("error", "streams:getStreamById failed", {
      streamId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Cheap existence check used to avoid duplicate inserts when an event fires twice.
 *
 * @async
 * @param {string} streamId - Provider-native id.
 * @returns {Promise<boolean>} `true` when a row with that id is already stored.
 * @throws {Error} When the SQLite read fails.
 */
async function streamExists(streamId) {
  dbLog("debug", "streams:streamExists", { streamId });
  try {
    return await db.transaction().execute(async (trx) => {
      const result = await trx
        .selectFrom("streams")
        .select("id")
        .where("id", "=", streamId)
        .executeTakeFirst();

      return result !== undefined;
    });
  } catch (err) {
    dbLog("error", "streams:streamExists failed", {
      streamId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Fold a fresh viewer-count sample into the running average for `streamId`.
 * Uses a numerically stable on-line mean — `(oldAvg * samples + current) / (samples + 1)` —
 * so the stored `viewers` column always reflects the average across the stream's lifetime.
 *
 * @async
 * @param {string} streamId - Provider-native id of the in-progress stream.
 * @param {number} currentViewers - Just-sampled concurrent viewer count.
 * @returns {Promise<boolean>} `true` when the row was found and updated.
 * @throws {Error} When the SQLite read or write fails.
 */
async function updateStreamViewers(streamId, currentViewers) {
  dbLog("debug", "streams:updateStreamViewers", { streamId, currentViewers });
  try {
    return await db.transaction().execute(async (trx) => {
      const stream = await trx
        .selectFrom("streams")
        .select(["viewers", "viewerSamples"])
        .where("id", "=", streamId)
        .executeTakeFirst();

      if (!stream) {
        dbLog("warn", "streams:updateStreamViewers no-row", { streamId });
        return false;
      }

      const samples = stream.viewerSamples;
      const oldAvg = stream.viewers;
      const newAverage = Math.round(
        (oldAvg * samples + currentViewers) / (samples + 1),
      );

      dbLog("info", "streams:viewerAverage updated", {
        streamId,
        oldAvg,
        samples,
        currentViewers,
        newAverage,
      });

      await trx
        .updateTable("streams")
        .set({ viewers: newAverage, viewerSamples: samples + 1 })
        .where("id", "=", streamId)
        .execute();

      return true;
    });
  } catch (err) {
    dbLog("error", "streams:updateStreamViewers failed", {
      streamId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Set the `end` column for the row matching `streamId`, marking the stream as ended.
 * Idempotent — calling twice with the same `endTime` just rewrites the same value.
 *
 * @async
 * @param {string} streamId - Provider-native id.
 * @param {string} endTime - ISO-8601 end timestamp.
 * @returns {Promise<boolean>} `true` when at least one row was updated.
 * @throws {Error} When the SQLite write fails.
 */
async function updateStreamEnd(streamId, endTime) {
  dbLog("debug", "streams:updateStreamEnd", { streamId, endTime });
  try {
    return await db.transaction().execute(async (trx) => {
      const result = await trx
        .updateTable("streams")
        .set({ end: endTime })
        .where("id", "=", streamId)
        .execute();

      const numUpdatedRows =
        result.numUpdatedRows !== undefined
          ? result.numUpdatedRows
          : Array.isArray(result)
            ? result.length
            : 0;

      return numUpdatedRows > 0;
    });
  } catch (err) {
    dbLog("error", "streams:updateStreamEnd failed", {
      streamId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Update the Discord announcement message id associated with a stream. Used when
 * the announcement is sent after the row was already created (for example when an
 * EventSub re-fire arrives after the bot restarted).
 *
 * @async
 * @param {string} streamId - Provider-native id.
 * @param {string} discMsgId - Discord message id to record.
 * @returns {Promise<boolean>} `true` when at least one row was updated.
 * @throws {Error} When the SQLite write fails.
 */
async function updateStreamDiscordMessage(streamId, discMsgId) {
  dbLog("debug", "streams:updateStreamDiscordMessage", { streamId, discMsgId });
  try {
    return await db.transaction().execute(async (trx) => {
      const result = await trx
        .updateTable("streams")
        .set({ discMsgId })
        .where("id", "=", streamId)
        .execute();

      const numUpdatedRows =
        result.numUpdatedRows !== undefined
          ? result.numUpdatedRows
          : Array.isArray(result)
            ? result.length
            : 0;

      return numUpdatedRows > 0;
    });
  } catch (err) {
    dbLog("error", "streams:updateStreamDiscordMessage failed", {
      streamId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

module.exports = {
  insertStream,
  getActiveStream,
  getMostRecentStream,
  getStreamById,
  streamExists,
  updateStreamViewers,
  updateStreamEnd,
  updateStreamDiscordMessage,
};
