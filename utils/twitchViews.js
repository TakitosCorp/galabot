const { updateStreamViewers } = require("../db/streams");

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
