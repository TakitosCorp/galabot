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
  const result = await db
    .selectFrom("warns")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("userId", "=", userId)
    .executeTakeFirst();
  return Number(result?.count ?? 0);
}

async function addWarn(userId, reason) {
  const timestamp = new Date().toISOString();
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("warns")
      .values({ userId, timestamp, reason })
      .execute();
  });
}

module.exports = {
  getUserWarns,
  getWarnCount,
  addWarn,
};
