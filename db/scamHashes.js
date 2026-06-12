/**
 * @module db/scamHashes
 * @description
 * Read/write helpers for the `scam_image_hashes` table.
 * Stores perceptual hashes of known scam images used for automated ban detection.
 */

"use strict";

const { db } = require("./database");
const { dbLog } = require("../utils/core/loggers");

/**
 * Persist a new scam image hash.
 *
 * @async
 * @param {string} hash - 64-char hex blockhash.
 * @param {string|null} description - Optional admin note.
 * @param {string} addedBy - Discord user id of the admin who registered it.
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
async function addScamHash(hash, description, addedBy) {
  const addedAt = Date.now();
  dbLog("debug", "scamHashes:addScamHash", { hash: hash.slice(0, 8), addedBy });
  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("scam_image_hashes")
        .values({
          hash,
          description: description ?? null,
          added_by: addedBy,
          added_at: addedAt,
        })
        .execute();
    });
    dbLog("info", "scamHashes:addScamHash ok", { addedBy });
  } catch (err) {
    dbLog("error", "scamHashes:addScamHash failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Return every registered scam hash. Called on each message with images.
 *
 * @async
 * @returns {Promise<Array<{id: number, hash: string, description: string|null, added_by: string, added_at: number}>>}
 * @throws {Error} When the SQLite read fails.
 */
async function getAllScamHashes() {
  dbLog("debug", "scamHashes:getAllScamHashes");
  try {
    return await db.selectFrom("scam_image_hashes").selectAll().execute();
  } catch (err) {
    dbLog("error", "scamHashes:getAllScamHashes failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Return all hashes ordered by registration date (newest first). Used by the list subcommand.
 *
 * @async
 * @returns {Promise<Array>}
 * @throws {Error} When the SQLite read fails.
 */
async function listScamHashes() {
  dbLog("debug", "scamHashes:listScamHashes");
  try {
    return await db
      .selectFrom("scam_image_hashes")
      .selectAll()
      .orderBy("added_at", "desc")
      .execute();
  } catch (err) {
    dbLog("error", "scamHashes:listScamHashes failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Delete a single scam hash by its primary key.
 *
 * @async
 * @param {number} id - Row id to delete.
 * @returns {Promise<number>} Number of rows deleted (0 or 1).
 * @throws {Error} When the SQLite write fails.
 */
async function removeScamHash(id) {
  dbLog("debug", "scamHashes:removeScamHash", { id });
  try {
    const result = await db.transaction().execute(async (trx) => {
      return trx
        .deleteFrom("scam_image_hashes")
        .where("id", "=", id)
        .executeTakeFirst();
    });
    const deleted = Number(result.numDeletedRows);
    dbLog("info", "scamHashes:removeScamHash ok", { id, deleted });
    return deleted;
  } catch (err) {
    dbLog("error", "scamHashes:removeScamHash failed", {
      id,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

module.exports = {
  addScamHash,
  getAllScamHashes,
  listScamHashes,
  removeScamHash,
};
