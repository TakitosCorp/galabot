/**
 * @module db/database
 * @description
 * Database connection and initialization. Sets up the better-sqlite3 connection,
 * configures Kysely, and handles schema creation and migrations.
 */

"use strict";

const Database = require("better-sqlite3");
const { Kysely, SqliteDialect } = require("kysely");
const { dbLog } = require("../utils/core/loggers");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const scamImagesDir = path.join(dataDir, "scam-images");
if (!fs.existsSync(scamImagesDir)) {
  fs.mkdirSync(scamImagesDir, { recursive: true });
}

const sqliteDb = new Database(path.join(dataDir, "galabot.sqlite"));

const db = new Kysely({
  dialect: new SqliteDialect({
    database: sqliteDb,
  }),
});

/**
 * Create every table the bot relies on if it does not already exist,
 * and handle automatic migrations for older schemas missing new columns.
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} When the underlying SQLite engine rejects.
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

      await trx.schema
        .createTable("streams")
        .ifNotExists()
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("provider", "text", (col) =>
          col.notNull().defaultTo("twitch"),
        )
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

      await trx.schema
        .createTable("discord_scheduled_events")
        .ifNotExists()
        .addColumn("source_id", "text", (col) => col.primaryKey())
        .addColumn("provider", "text", (col) =>
          col.notNull().defaultTo("twitch"),
        )
        .addColumn("discord_event_id", "text", (col) => col.notNull())
        .addColumn("created_at", "datetime", (col) => col.notNull())
        .addColumn("scheduled_start", "text")
        .addColumn("scheduled_end", "text")
        .addColumn("title", "text")
        .execute();

      await trx.schema
        .createTable("reaction_role_messages")
        .ifNotExists()
        .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
        .addColumn("message_id", "text", (col) => col.notNull().unique())
        .addColumn("channel_id", "text", (col) => col.notNull())
        .addColumn("guild_id", "text", (col) => col.notNull())
        .addColumn("group_name", "text", (col) =>
          col.notNull().defaultTo("RULES"),
        )
        .addColumn("created_at", "datetime", (col) => col.notNull())
        .execute();

      await trx.schema
        .createTable("upcoming_streams")
        .ifNotExists()
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("provider", "text", (col) => col.notNull())
        .addColumn("title", "text", (col) => col.notNull())
        .addColumn("scheduled_start", "text", (col) => col.notNull())
        .addColumn("scheduled_end", "text")
        .addColumn("url", "text", (col) => col.notNull())
        .addColumn("category", "text")
        .addColumn("scheduled_start_ts", "integer")
        .execute();

      await trx.schema
        .createTable("scam_image_hashes")
        .ifNotExists()
        .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
        .addColumn("hash", "text", (col) => col.notNull())
        .addColumn("description", "text")
        .addColumn("added_by", "text", (col) => col.notNull())
        .addColumn("added_at", "integer", (col) => col.notNull())
        .execute();
    });

    const streamsInfo = sqliteDb.pragma("table_info(streams)");
    if (streamsInfo.length > 0) {
      const cols = streamsInfo.map((c) => c.name);
      if (!cols.includes("provider")) {
        sqliteDb.exec(
          "ALTER TABLE streams ADD COLUMN provider text NOT NULL DEFAULT 'twitch'",
        );
        dbLog("info", "db:migration added provider to streams");
      }
      if (!cols.includes("category")) {
        sqliteDb.exec("ALTER TABLE streams ADD COLUMN category text");
        dbLog("info", "db:migration added category to streams");
      }
      if (!cols.includes("tags")) {
        sqliteDb.exec("ALTER TABLE streams ADD COLUMN tags text");
        dbLog("info", "db:migration added tags to streams");
      }
      if (!cols.includes("thumbnail")) {
        sqliteDb.exec("ALTER TABLE streams ADD COLUMN thumbnail text");
        dbLog("info", "db:migration added thumbnail to streams");
      }
    }

    const eventsInfo = sqliteDb.pragma("table_info(discord_scheduled_events)");
    if (eventsInfo.length > 0) {
      const cols = eventsInfo.map((c) => c.name);
      if (!cols.includes("provider")) {
        sqliteDb.exec(
          "ALTER TABLE discord_scheduled_events ADD COLUMN provider text NOT NULL DEFAULT 'twitch'",
        );
        dbLog(
          "info",
          "db:migration added provider to discord_scheduled_events",
        );
      }
      if (!cols.includes("scheduled_start")) {
        sqliteDb.exec(
          "ALTER TABLE discord_scheduled_events ADD COLUMN scheduled_start text",
        );
        dbLog(
          "info",
          "db:migration added scheduled_start to discord_scheduled_events",
        );
      }
      if (!cols.includes("scheduled_end")) {
        sqliteDb.exec(
          "ALTER TABLE discord_scheduled_events ADD COLUMN scheduled_end text",
        );
        dbLog(
          "info",
          "db:migration added scheduled_end to discord_scheduled_events",
        );
      }
      if (!cols.includes("title")) {
        sqliteDb.exec(
          "ALTER TABLE discord_scheduled_events ADD COLUMN title text",
        );
        dbLog("info", "db:migration added title to discord_scheduled_events");
      }
    }

    const rrInfo = sqliteDb.pragma("table_info(reaction_role_messages)");
    if (rrInfo.length > 0) {
      const cols = rrInfo.map((c) => c.name);
      if (!cols.includes("group_name")) {
        sqliteDb.exec(
          "ALTER TABLE reaction_role_messages ADD COLUMN group_name text NOT NULL DEFAULT 'RULES'",
        );
        dbLog(
          "info",
          "db:migration added group_name to reaction_role_messages",
        );
      }
    }

    const upcomingInfo = sqliteDb.pragma("table_info(upcoming_streams)");
    if (upcomingInfo.length > 0) {
      const cols = upcomingInfo.map((c) => c.name);
      if (!cols.includes("scheduled_start_ts")) {
        sqliteDb.exec(
          "ALTER TABLE upcoming_streams ADD COLUMN scheduled_start_ts integer",
        );
        sqliteDb.exec(
          "UPDATE upcoming_streams SET scheduled_start_ts = CAST(strftime('%s', scheduled_start) AS INTEGER) WHERE scheduled_start_ts IS NULL",
        );
        dbLog(
          "info",
          "db:migration added scheduled_start_ts to upcoming_streams",
        );
      }
    }

    const scamInfo = sqliteDb.pragma("table_info(scam_image_hashes)");
    if (scamInfo.length > 0 && !scamInfo.map((c) => c.name).includes("filename")) {
      sqliteDb.exec("ALTER TABLE scam_image_hashes ADD COLUMN filename text");
      dbLog("info", "db:migration added filename to scam_image_hashes");
    }

    dbLog("info", "db:initialize complete");
  } catch (err) {
    dbLog("error", "db:initialize failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

module.exports = {
  db,
  sqliteDb,
  initialize,
};
