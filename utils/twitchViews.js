const { updateStreamViewers } = require("../db/streams");
const { twitchLog } = require("./loggers");
const { VIEWER_POLL_INTERVAL_MS } = require("./constants");

const viewersIntervals = new Map();

function startViewersAverage(streamId, twitchApiClient, twitchChannel) {
  if (viewersIntervals.has(streamId)) return;

  const interval = setInterval(async () => {
    try {
      const user = await twitchApiClient.users.getUserByName(twitchChannel);
      if (!user) return;
      const stream = await twitchApiClient.streams.getStreamByUserId(user.id);
      if (stream && stream.viewers !== undefined) {
        await updateStreamViewers(streamId, stream.viewers);
      }
    } catch (err) {
      twitchLog(
        "error",
        `Failed to update viewer average for stream ${streamId}: ${err.message}`,
      );
    }
  }, VIEWER_POLL_INTERVAL_MS);
  viewersIntervals.set(streamId, interval);
}

function stopViewersAverage(streamId) {
  const interval = viewersIntervals.get(streamId);
  if (interval) {
    clearInterval(interval);
    viewersIntervals.delete(streamId);
  }
}

function stopAllViewersIntervals() {
  for (const interval of viewersIntervals.values()) clearInterval(interval);
  viewersIntervals.clear();
}

module.exports = {
  startViewersAverage,
  stopViewersAverage,
  stopAllViewersIntervals,
};
