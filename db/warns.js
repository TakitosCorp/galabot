const { db } = require("./database");

// Obtain all the warnings for a user
async function getUserWarns(userId) {
  return await db.transaction().execute(async (trx) => {
    return await trx
      .selectFrom("warns")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("timestamp", "desc")
      .execute();
  });
}

// Get the total number of warnings for a user
async function getWarnCount(userId) {
  return await db.transaction().execute(async (trx) => {
    const warns = await trx
      .selectFrom("warns")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("timestamp", "desc")
      .execute();
    return warns.length;
  });
}

// Save a new warning for a user
async function addWarn(userId, reason) {
  const timestamp = new Date().toISOString();
  await db.transaction().execute(async (trx) => {
    await trx.insertInto("warns").values({ userId, timestamp, reason }).execute();
  });
}

module.exports = {
  getUserWarns,
  getWarnCount,
  addWarn,
}