const { db } = require("./database");

// Obtain the last greeting for a user
async function getLastGreeting(userId, trx = db) {
  return await trx
    .selectFrom("greetings")
    .selectAll()
    .where("userId", "=", userId)
    .orderBy("timestamp", "desc")
    .limit(1)
    .executeTakeFirst();
}

// Update or insert a greeting for a user
async function updateGreeting(userId, timestamp) {
  await db.transaction().execute(async (trx) => {
    const existing = await getLastGreeting(userId, trx);

    if (existing) {
      await trx.updateTable("greetings").set({ timestamp }).where("id", "=", existing.id).execute();
    } else {
      await trx.insertInto("greetings").values({ userId, timestamp }).execute();
    }
  });
}

module.exports = { getLastGreeting, updateGreeting };
