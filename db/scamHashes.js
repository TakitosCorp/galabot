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
 * Persist a new scam image hash and return its inserted row id.
 *
 * @async
 * @param {string} hash - 64-char hex blockhash.
 * @param {string|null} description - Optional admin note.
 * @param {string} addedBy - Discord user id of the admin who registered it.
 * @param {string|null} [filename] - Optional thumbnail filename (set after file is saved).
 * @returns {Promise<number>} The inserted row id.
 * @throws {Error} When the SQLite write fails.
 */
async function addScamHash(hash, description, addedBy, filename = null) {
  const addedAt = Date.now();
  dbLog("debug", "scamHashes:addScamHash", { hash: hash.slice(0, 8), addedBy });
  try {
    let insertedId;
    await db.transaction().execute(async (trx) => {
      const result = await trx
        .insertInto("scam_image_hashes")
        .values({
          hash,
          description: description ?? null,
          added_by: addedBy,
          added_at: addedAt,
          filename: filename ?? null,
        })
        .executeTakeFirst();
      insertedId = Number(result.insertId);
    });
    dbLog("info", "scamHashes:addScamHash ok", { addedBy, id: insertedId });
    return insertedId;
  } catch (err) {
    dbLog("error", "scamHashes:addScamHash failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Update the thumbnail filename for an existing hash row.
 *
 * @async
 * @param {number} id - Row id.
 * @param {string} filename - Thumbnail filename (e.g. "42.webp").
 * @returns {Promise<void>}
 * @throws {Error} When the SQLite write fails.
 */
async function updateScamHashFilename(id, filename) {
  dbLog("debug", "scamHashes:updateScamHashFilename", { id, filename });
  try {
    await db
      .updateTable("scam_image_hashes")
      .set({ filename })
      .where("id", "=", id)
      .execute();
    dbLog("info", "scamHashes:updateScamHashFilename ok", { id });
  } catch (err) {
    dbLog("error", "scamHashes:updateScamHashFilename failed", {
      id,
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
 * @returns {Promise<Array<{id: number, hash: string, description: string|null, added_by: string, added_at: number, filename: string|null}>>}
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
 * Return a single hash row by its primary key.
 *
 * @async
 * @param {number} id - Row id.
 * @returns {Promise<object|undefined>}
 * @throws {Error} When the SQLite read fails.
 */
async function getScamHashById(id) {
  dbLog("debug", "scamHashes:getScamHashById", { id });
  try {
    return await db
      .selectFrom("scam_image_hashes")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  } catch (err) {
    dbLog("error", "scamHashes:getScamHashById failed", {
      id,
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
  updateScamHashFilename,
  getAllScamHashes,
  listScamHashes,
  getScamHashById,
  removeScamHash,
};
