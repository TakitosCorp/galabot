/**
 * @module db/database
 * @description
 * SQLite + Kysely connection bootstrap. Owns the singleton `db` instance every
 * other module under `db/` imports, and exposes an `initialize()` that ensures
 * all tables exist on startup. The database file lives at `<projectRoot>/data/galabot.sqlite`.
 *
 * Tables managed here:
 *  - `greetings` — last greeting timestamp per user (cooldown tracking).
 *  - `warns` — moderation warnings.
 *  - `streams` — unified stream history across Twitch + YouTube.
 */

"use strict";

const { Kysely, SqliteDialect } = require("kysely");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { dbLog } = require("../utils/loggers");

/**
 * Absolute path to the project's `data/` directory. Created on first load.
 * @type {string}
 * @constant
 */
const dataDir = path.resolve(__dirname, "../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  dbLog("info", "db:dataDir created", { dataDir });
}

/**
 * Absolute path to the SQLite database file.
 * @type {string}
 * @constant
 */
const dbFile = path.join(dataDir, "galabot.sqlite");

/**
 * Singleton Kysely instance backed by `better-sqlite3`. Imported by every
 * query helper under `db/`.
 * @type {import('kysely').Kysely<any>}
 */
const db = new Kysely({
  dialect: new SqliteDialect({
    database: new Database(dbFile),
  }),
});

dbLog("debug", "db:connection ready", { dbFile });

/**
 * Create every table the bot relies on if it does not already exist. Safe to call
 * repeatedly — every `createTable` is wrapped with `.ifNotExists()`. All schema
 * changes happen in a single transaction so partial migrations cannot leak.
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} When the underlying SQLite engine rejects (e.g. permission denied).
 */
async function initialize() {
  dbLog("info", "db:initialize start");
  try {
    await db.transaction().execute(async (trx) => {
      await trx.schema
        .createTable("greetings")
        .ifNotExists()
        .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
        .addColumn("userId", "text", (col) => col.notNull())
        .addColumn("timestamp", "datetime", (col) => col.notNull())
        .execute();

      await trx.schema
        .createTable("warns")
        .ifNotExists()
        .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
        .addColumn("userId", "text", (col) => col.notNull())
        .addColumn("timestamp", "datetime", (col) => col.notNull())
        .addColumn("reason", "text", (col) => col.notNull())
        .execute();

      // Unified stream table across all providers.
      // provider: 'twitch' | 'youtube'
      // category, tags  — Twitch only; NULL for other providers.
      // thumbnail       — YouTube only; NULL for other providers.
      await trx.schema
        .createTable("streams")
        .ifNotExists()
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("provider", "text", (col) => col.notNull())
        .addColumn("timestamp", "datetime", (col) => col.notNull())
        .addColumn("title", "text", (col) => col.notNull())
        .addColumn("viewers", "real", (col) => col.notNull().defaultTo(0))
        .addColumn("viewerSamples", "integer", (col) =>
          col.notNull().defaultTo(0),
        )
        .addColumn("category", "text")
        .addColumn("tags", "text")
        .addColumn("thumbnail", "text")
        .addColumn("discMsgId", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("end", "datetime")
        .execute();
    });
    dbLog("info", "db:initialize complete");
  } catch (err) {
    dbLog("error", "db:initialize failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

module.exports = { db, initialize };
