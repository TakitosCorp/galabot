const { Kysely, SqliteDialect } = require("kysely");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dataDir = path.resolve(__dirname, "../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = path.join(dataDir, "galabot.sqlite");
const db = new Kysely({
  dialect: new SqliteDialect({
    database: new Database(dbFile),
  }),
});

async function initialize() {
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
}

module.exports = { db, initialize };
