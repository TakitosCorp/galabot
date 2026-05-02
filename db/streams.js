const { db } = require("./database");
const { dbLog } = require("../utils/loggers");

async function insertStream(streamData) {
  return await db.transaction().execute(async (trx) => {
    return await trx
      .insertInto("streams")
      .values({
        id: streamData.id,
        provider: streamData.provider,
        timestamp: streamData.timestamp,
        title: streamData.title,
        viewers: streamData.viewers ?? 0,
        category: streamData.category ?? null,
        tags: streamData.tags ?? null,
        thumbnail: streamData.thumbnail ?? null,
        discMsgId: streamData.discMsgId || "",
      })
      .execute();
  });
}

async function getActiveStream(provider) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .selectFrom("streams")
      .selectAll()
      .where("provider", "=", provider)
      .where("end", "is", null)
      .orderBy("timestamp", "desc")
      .executeTakeFirst();

    return result || null;
  });
}

async function getMostRecentStream(provider) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .selectFrom("streams")
      .selectAll()
      .where("provider", "=", provider)
      .orderBy("timestamp", "desc")
      .executeTakeFirst();

    return result || null;
  });
}

async function getStreamById(streamId) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .selectFrom("streams")
      .selectAll()
      .where("id", "=", streamId)
      .executeTakeFirst();

    return result || null;
  });
}

async function streamExists(streamId) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .selectFrom("streams")
      .select("id")
      .where("id", "=", streamId)
      .executeTakeFirst();

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
    const newAverage = Math.round(
      (oldAvg * samples + currentViewers) / (samples + 1),
    );

    dbLog(
      "info",
      `Viewer average for ${streamId}: oldAvg=${oldAvg}, samples=${samples}, current=${currentViewers} -> newAvg=${newAverage}`,
    );

    await trx
      .updateTable("streams")
      .set({ viewers: newAverage, viewerSamples: samples + 1 })
      .where("id", "=", streamId)
      .execute();

    return true;
  });
}

async function updateStreamEnd(streamId, endTime) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .updateTable("streams")
      .set({ end: endTime })
      .where("id", "=", streamId)
      .execute();

    const numUpdatedRows =
      result.numUpdatedRows !== undefined
        ? result.numUpdatedRows
        : Array.isArray(result)
          ? result.length
          : 0;

    return numUpdatedRows > 0;
  });
}

async function updateStreamDiscordMessage(streamId, discMsgId) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .updateTable("streams")
      .set({ discMsgId })
      .where("id", "=", streamId)
      .execute();

    const numUpdatedRows =
      result.numUpdatedRows !== undefined
        ? result.numUpdatedRows
        : Array.isArray(result)
          ? result.length
          : 0;

    return numUpdatedRows > 0;
  });
}

module.exports = {
  insertStream,
  getActiveStream,
  getMostRecentStream,
  getStreamById,
  streamExists,
  updateStreamViewers,
  updateStreamEnd,
  updateStreamDiscordMessage,
};
