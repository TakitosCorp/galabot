const { updateStreamViewers } = require("../db/streams");
const { twitchLog } = require("./loggers");

const viewersIntervals = new Map();

function startViewersAverage(streamId, twitchApiClient, twitchChannel) {
  if (viewersIntervals.has(streamId)) return;

  const interval = setInterval(async () => {
    try {
      const user = await twitchApiClient.users.getUserByName(twitchChannel);
      if (!user) return;
      const stream = await twitchApiClient.streams.getStreamByUserId(user.id);
      if (stream && stream.viewers !== undefined) {
        twitchLog("info", `Actualizando media para el stream ${streamId}: ${stream.viewers}`);
        await updateStreamViewers(streamId, stream.viewers);
      }
    } catch (err) {
      twitchLog("error", `No se pudo actualizar la media de espectadores para el stream ${streamId}: ${err.message}`);
    }
  }, 60 * 1000);
  viewersIntervals.set(streamId, interval);
}

function stopViewersAverage(streamId) {
  const interval = viewersIntervals.get(streamId);
  if (interval) {
    clearInterval(interval);
    viewersIntervals.delete(streamId);
  }
}

module.exports = {
  startViewersAverage,
  stopViewersAverage,
};
