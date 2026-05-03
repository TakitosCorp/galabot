/**
 * @module db/warns
 * @description
 * Read/write helpers for the `warns` table. Each call to {@link addWarn} appends
 * a new row — the moderation flow never deletes warnings, it only counts them.
 *
 * @typedef {import('../utils/types').WarnRow} WarnRow
 */

"use strict";

const { db } = require("./database");
const { dbLog } = require("../utils/loggers");

/**
 * Return every warning row issued to a given user, newest first.
 *
 * @async
 * @param {string} userId - Discord user id.
 * @returns {Promise<WarnRow[]>} All persisted warnings for the user.
 * @throws {Error} When the SQLite read fails.
 */
async function getUserWarns(userId) {
  dbLog("debug", "warns:getUserWarns", { userId });
  try {
    return await db.transaction().execute(async (trx) => {
      return await trx
        .selectFrom("warns")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("timestamp", "desc")
        .execute();
    });
  } catch (err) {
    dbLog("error", "warns:getUserWarns failed", {
      userId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Count how many warnings have been issued to a given user. Used to decide
 * between timeout vs. ban escalation.
 *
 * @async
 * @param {string} userId - Discord user id.
 * @returns {Promise<number>} The total warning count (0 when the user has none).
 * @throws {Error} When the SQLite read fails.
 */
async function getWarnCount(userId) {
  dbLog("debug", "warns:getWarnCount", { userId });
  try {
    const result = await db
      .selectFrom("warns")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("userId", "=", userId)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  } catch (err) {
    dbLog("error", "warns:getWarnCount failed", {
      userId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Append a new warning for `userId` with the supplied `reason`. The timestamp is
 * generated server-side at insert time so callers do not need to coordinate clocks.
 *
 * @async
 * @param {string} userId - Discord user id of the warned user.
 * @param {string} reason - Free-text moderator reason (caller-validated length).
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
async function addWarn(userId, reason) {
  const timestamp = new Date().toISOString();
  dbLog("debug", "warns:addWarn", { userId, reasonLength: reason.length });
  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("warns")
        .values({ userId, timestamp, reason })
        .execute();
    });
    dbLog("info", "warns:addWarn ok", { userId });
  } catch (err) {
    dbLog("error", "warns:addWarn failed", {
      userId,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

module.exports = {
  getUserWarns,
  getWarnCount,
  addWarn,
};
