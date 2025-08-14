const { db } = require("./database");

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
};
