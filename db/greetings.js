/**
 * @module db/greetings
 * @description
 * Per-user greeting cooldown persistence. The bot only stores **the most recent**
 * greeting timestamp for each user — older rows are overwritten in place rather
 * than accumulating a full history.
 *
 * @typedef {import('../utils/types').GreetingRow} GreetingRow
 */

"use strict";

const { db } = require("./database");
const { dbLog } = require("../utils/loggers");

/**
 * Fetch the most recent greeting row for a given user, if any.
 *
 * @async
 * @param {string} userId - Platform-agnostic user id (Discord or Twitch).
 * @param {import('kysely').Kysely<any>|import('kysely').Transaction<any>} [trx=db] - Optional transaction binder when called from inside another transaction.
 * @returns {Promise<GreetingRow|undefined>} The latest row, or `undefined` if the user has never been greeted.
 */
async function getLastGreeting(userId, trx = db) {
  dbLog("debug", "greetings:getLastGreeting", { userId });
  try {
    return await trx
      .selectFrom("greetings")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("timestamp", "desc")
      .limit(1)
      .executeTakeFirst();
  } catch (err) {
    dbLog("error", "greetings:getLastGreeting failed", {
      userId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Upsert the greeting timestamp for `userId`. If a previous row exists it is
 * updated in place (so each user owns at most one greeting record); otherwise a
 * new row is inserted. Wrapped in a transaction to make the read-then-write
 * atomic against concurrent callers.
 *
 * @async
 * @param {string} userId - Platform-agnostic user id.
 * @param {string} timestamp - ISO-8601 greeting timestamp to record.
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
async function updateGreeting(userId, timestamp) {
  dbLog("debug", "greetings:updateGreeting", { userId, timestamp });
  try {
    await db.transaction().execute(async (trx) => {
      const existing = await getLastGreeting(userId, trx);

      if (existing) {
        await trx
          .updateTable("greetings")
          .set({ timestamp })
          .where("id", "=", existing.id)
          .execute();
      } else {
        await trx
          .insertInto("greetings")
          .values({ userId, timestamp })
          .execute();
      }
    });
  } catch (err) {
    dbLog("error", "greetings:updateGreeting failed", {
      userId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

module.exports = { getLastGreeting, updateGreeting };
