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

// Function to initialize the database schema
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

    await trx.schema
      .createTable("streams")
      .ifNotExists()
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("timestamp", "datetime", (col) => col.notNull())
      .addColumn("title", "text", (col) => col.notNull())
      .addColumn("viewers", "integer", (col) => col.notNull())
      .addColumn("category", "text", (col) => col.notNull())
      .addColumn("tags", "text", (col) => col.notNull())
      .addColumn("end", "datetime", (col) => col.nullable())
      .execute();
  });
}

module.exports = { db, initialize };
