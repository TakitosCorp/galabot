const { Kysely, SqliteDialect } = require("kysely");
const { Database } = require("sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.resolve(__dirname, "../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize the database connection
const db = new Kysely({
  dialect: new SqliteDialect({
    database: new Database(path.join(dataDir, "galabot.db")),
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
  });
}

module.exports = { db, initialize };
