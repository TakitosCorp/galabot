const { db } = require("./database");
const { youtubeLog } = require("../utils/loggers");

async function insertYoutubeStream(streamData) {
  return await db.transaction().execute(async (trx) => {
    return await trx
      .insertInto("youtube_streams")
      .values({
        id: streamData.id,
        timestamp: streamData.timestamp,
        title: streamData.title,
        viewers: streamData.viewers,
        thumbnail: streamData.thumbnail,
        discMsgId: streamData.discMsgId || "",
      })
      .execute();
  });
}

async function getMostRecentYoutubeStream() {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .selectFrom("youtube_streams")
      .selectAll()
      .orderBy("timestamp", "desc")
      .executeTakeFirst();

    return result || null;
  });
}

async function youtubeStreamExists(videoId) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .selectFrom("youtube_streams")
      .select("id")
      .where("id", "=", videoId)
      .executeTakeFirst();

    return result !== undefined;
  });
}

async function updateYoutubeStreamViewers(videoId, currentViewers) {
  return await db.transaction().execute(async (trx) => {
    const stream = await trx
      .selectFrom("youtube_streams")
      .select(["viewers", "viewerSamples"])
      .where("id", "=", videoId)
      .executeTakeFirst();

    if (!stream) return false;

    const samples = stream.viewerSamples;
    const oldAvg = stream.viewers;
    const newAverage = Math.round(
      (oldAvg * samples + currentViewers) / (samples + 1),
    );

    youtubeLog(
      "info",
      `Viewer average for ${videoId}: oldAvg=${oldAvg}, samples=${samples}, current=${currentViewers} -> newAvg=${newAverage}`,
    );

    await trx
      .updateTable("youtube_streams")
      .set({ viewers: newAverage, viewerSamples: samples + 1 })
      .where("id", "=", videoId)
      .execute();

    return true;
  });
}

async function updateYoutubeStreamEnd(videoId, endTime) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .updateTable("youtube_streams")
      .set({ end: endTime })
      .where("id", "=", videoId)
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

async function updateYoutubeStreamDiscordMessage(videoId, discMsgId) {
  return await db.transaction().execute(async (trx) => {
    const result = await trx
      .updateTable("youtube_streams")
      .set({ discMsgId })
      .where("id", "=", videoId)
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
  insertYoutubeStream,
  getMostRecentYoutubeStream,
  youtubeStreamExists,
  updateYoutubeStreamViewers,
  updateYoutubeStreamEnd,
  updateYoutubeStreamDiscordMessage,
};
