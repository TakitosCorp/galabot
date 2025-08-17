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
        discMsgId: streamData.discMsgId || "",
      })
      .execute();
  });
}

async function getMostRecentStream() {
  return await db.transaction().execute(async (trx) => {
    const result = await trx.selectFrom("streams").selectAll().orderBy("timestamp", "desc").executeTakeFirst();

    return result || null;
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
    const stream = await trx
      .selectFrom("streams")
      .select(["viewers", "viewerSamples"])
      .where("id", "=", streamId)
      .executeTakeFirst();

    if (!stream) return false;

    const samples = stream.viewerSamples;
    const oldAvg = stream.viewers;

    const newAverage = Math.round((oldAvg * samples + currentViewers) / (samples + 1));

    await trx
      .updateTable("streams")
      .set({
        viewers: newAverage,
        viewerSamples: samples + 1,
      })
      .where("id", "=", streamId)
      .execute();

    return true;
  });
}

async function updateStreamEnd(streamId, endTime) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx.updateTable("streams").set({ end: endTime }).where("id", "=", streamId).execute();

    const numUpdatedRows =
      result.numUpdatedRows !== undefined ? result.numUpdatedRows : Array.isArray(result) ? result.length : 0;

    return numUpdatedRows > 0;
  });
}

async function updateStreamDiscordMessage(streamId, discMsgId) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx.updateTable("streams").set({ discMsgId }).where("id", "=", streamId).execute();

    const numUpdatedRows =
      result.numUpdatedRows !== undefined ? result.numUpdatedRows : Array.isArray(result) ? result.length : 0;

    return numUpdatedRows > 0;
  });
}

module.exports = {
  insertStream,
  streamExists,
  updateStreamViewers,
  updateStreamEnd,
  getMostRecentStream,
  updateStreamDiscordMessage,
};
