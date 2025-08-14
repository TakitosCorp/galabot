const { db } = require("./database");

async function insertStream(streamData) {
  return await db.transaction().execute(async (trx) => {
    return await trx
      .insertInto("streams")
      .values({
        id: streamData.id,
        timestamp: streamData.timestamp,
        title: streamData.title,
        viewers: streamData.viewers,
        category: streamData.category,
        tags: streamData.tags,
      })
      .execute();
  });
}

async function streamExists(streamId) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx.selectFrom("streams").select("id").where("id", "=", streamId).executeTakeFirst();

    return result !== undefined;
  });
}

async function updateStreamViewers(streamId, currentViewers) {
  return await db.transaction().execute(async (trx) => {
    const stream = await trx.selectFrom("streams").select("viewers").where("id", "=", streamId).executeTakeFirst();

    if (!stream) return false;

    const newAverage = stream.viewers === 0 ? currentViewers : (stream.viewers + currentViewers) / 2;

    await trx.updateTable("streams").set({ viewers: newAverage }).where("id", "=", streamId).execute();

    return true;
  });
}

async function updateStreamEnd(streamId, endTime) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx.updateTable("streams").set({ end: endTime }).where("id", "=", streamId).execute();

    return result.numUpdatedRows > 0;
  });
}

module.exports = {
  insertStream,
  streamExists,
  updateStreamViewers,
  updateStreamEnd,
};
