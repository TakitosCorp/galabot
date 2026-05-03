/**
 * @module utils/twitchViews
 * @description
 * Tracks per-stream Twitch viewer-count poll intervals. For each live stream we
 * spin up a `setInterval` that samples concurrent viewer count every
 * {@link VIEWER_POLL_INTERVAL_MS} and folds it into the rolling average via
 * {@link module:db/streams.updateStreamViewers}.
 *
 * The `Map` keyed by `streamId` ensures we never double-poll a stream and lets
 * the shutdown path stop everything in one call.
 */

"use strict";

const { updateStreamViewers } = require("../db/streams");
const { twitchLog } = require("./loggers");
const { VIEWER_POLL_INTERVAL_MS } = require("./constants");

/**
 * Active polling timers keyed by stream id.
 * @type {Map<string, NodeJS.Timeout>}
 */
const viewersIntervals = new Map();

/**
 * Begin sampling viewer counts for `streamId`. No-op if a poller already exists
 * for the same id.
 *
 * @param {string} streamId - Twitch stream id (matches the row in `streams`).
 * @param {import('@twurple/api').ApiClient} twitchApiClient - Helix client to query with.
 * @param {string} twitchChannel - Twitch channel name (with or without `#`).
 * @returns {void}
 */
function startViewersAverage(streamId, twitchApiClient, twitchChannel) {
  if (viewersIntervals.has(streamId)) {
    twitchLog("debug", "twitchViews:start already-running", { streamId });
    return;
  }

  twitchLog("info", "twitchViews:start poller", {
    streamId,
    twitchChannel,
    intervalMs: VIEWER_POLL_INTERVAL_MS,
  });

  const interval = setInterval(async () => {
    try {
      const user = await twitchApiClient.users.getUserByName(twitchChannel);
      if (!user) {
        twitchLog("warn", "twitchViews:tick user-not-found", {
          twitchChannel,
        });
        return;
      }
      const stream = await twitchApiClient.streams.getStreamByUserId(user.id);
      if (stream && stream.viewers !== undefined) {
        twitchLog("debug", "twitchViews:tick sample", {
          streamId,
          viewers: stream.viewers,
        });
        await updateStreamViewers(streamId, stream.viewers);
      } else {
        twitchLog("debug", "twitchViews:tick no-stream-or-viewers", {
          streamId,
        });
      }
    } catch (err) {
      twitchLog("error", "twitchViews:tick failed", {
        streamId,
        err: err.message,
        stack: err.stack,
      });
    }
  }, VIEWER_POLL_INTERVAL_MS);
  viewersIntervals.set(streamId, interval);
}

/**
 * Stop the poller for `streamId` and forget it. Safe to call when no poller
 * is registered for that id.
 *
 * @param {string} streamId
 * @returns {void}
 */
function stopViewersAverage(streamId) {
  const interval = viewersIntervals.get(streamId);
  if (interval) {
    clearInterval(interval);
    viewersIntervals.delete(streamId);
    twitchLog("info", "twitchViews:stop poller", { streamId });
  }
}

/**
 * Stop every active poller. Used by the graceful-shutdown path.
 * @returns {void}
 */
function stopAllViewersIntervals() {
  const count = viewersIntervals.size;
  for (const interval of viewersIntervals.values()) clearInterval(interval);
  viewersIntervals.clear();
  twitchLog("info", "twitchViews:stop-all", { count });
}

module.exports = {
  startViewersAverage,
  stopViewersAverage,
  stopAllViewersIntervals,
};
