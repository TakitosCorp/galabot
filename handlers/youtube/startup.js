/**
 * @module handlers/youtube/startup
 * @description
 * Boots the YouTube polling subsystem. Two intervals run in parallel:
 *  - **Slow poll** ({@link YOUTUBE_SLOW_POLL_MS}): scans the configured channel
 *    for new live/upcoming videos via search.list (high quota cost).
 *  - **Fast poll** ({@link YOUTUBE_FAST_POLL_MS}): once we have a tracked video,
 *    re-checks its `liveStreamingDetails` for live state and viewer count
 *    (low quota cost).
 *
 * On startup we also rehydrate state from the DB so a process restart does not
 * cause a duplicate announcement for a stream that's already live.
 */

"use strict";

const {
  updateWorkflow,
  checkWorkflow,
  getState,
  setState,
  fetchAndCacheCategories,
} = require("../../utils/youtubePoller");
const streamStartHandler = require("../../events/youtube/streamStart");
const streamEndHandler = require("../../events/youtube/streamEnd");
const { updateStreamViewers, getActiveStream } = require("../../db/streams");
const { youtubeLog } = require("../../utils/loggers");
const {
  YOUTUBE_FAST_POLL_MS,
  YOUTUBE_SLOW_POLL_MS,
  YOUTUBE_CATEGORY_POLL_MS,
} = require("../../utils/constants");

/**
 * One pass of the slow poll: refresh the tracked stream candidate by searching
 * for new upcoming/live entries on the channel.
 *
 * @async
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<void>}
 */
async function runSlowPoll(clientManager) {
  try {
    youtubeLog("info", "youtube:slowPoll start");
    await updateWorkflow();
    const state = getState();
    if (state.videoId) {
      youtubeLog("info", "youtube:slowPoll tracked", {
        videoId: state.videoId,
        title: state.title,
        status: state.status,
        scheduledStart: state.scheduledStart,
      });
    } else {
      youtubeLog("info", "youtube:slowPoll no-streams");
    }
  } catch (err) {
    youtubeLog("error", "youtube:slowPoll failed", {
      err: err.message,
      stack: err.stack,
    });
  }
}

/**
 * One pass of the fast poll: re-check the currently tracked video and drive the
 * `idle → upcoming → starting → live → ended` state machine.
 *
 * @async
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<void>}
 */
async function runFastPoll(clientManager) {
  try {
    const result = await checkWorkflow();
    if (!result) {
      youtubeLog("debug", "youtube:fastPoll no-result");
      return;
    }

    const state = getState();
    youtubeLog("debug", "youtube:fastPoll tick", {
      videoId: state.videoId,
      status: state.status,
      isLive: result.isLive,
      viewers: result.viewers,
      hasEnd: Boolean(result.endTime),
    });

    if (result.endTime && state.status === "live") {
      youtubeLog("info", "youtube:fastPoll stream-end detected", {
        videoId: state.videoId,
        endTime: result.endTime,
      });
      await streamEndHandler(clientManager, result.endTime);
      return;
    }

    if (result.isLive) {
      if (state.status === "live" && state.embedSent) {
        if (result.viewers > 0) {
          await updateStreamViewers(state.videoId, result.viewers);
        }
        return;
      }

      if (state.status !== "starting" && state.status !== "live") {
        youtubeLog("info", "youtube:fastPoll grace-period (starting)", {
          videoId: state.videoId,
        });
        setState({ status: "starting" });
        return;
      }

      if (
        (state.status === "starting" ||
          state.status === "upcoming" ||
          state.status === "live") &&
        !state.embedSent
      ) {
        youtubeLog("info", "youtube:fastPoll confirming live", {
          videoId: state.videoId,
        });
        await streamStartHandler(clientManager, state);
      }
    }
  } catch (err) {
    youtubeLog("error", "youtube:fastPoll failed", {
      err: err.message,
      stack: err.stack,
    });
  }
}

/**
 * Bootstrap entry point. Rehydrates state from the DB, runs an initial poll
 * cycle synchronously so the bot can react immediately, and then registers the
 * recurring intervals on `clientManager.youtubeIntervals`.
 *
 * @async
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<void>}
 */
async function bootstrap(clientManager) {
  youtubeLog("info", "youtube:bootstrap start");

  const activeStream = await getActiveStream("youtube");
  if (activeStream) {
    setState({
      videoId: activeStream.id,
      title: activeStream.title,
      thumbnail: activeStream.thumbnail,
      status: "live",
      embedSent: true,
    });
    youtubeLog("info", "youtube:bootstrap rehydrated", {
      videoId: activeStream.id,
      title: activeStream.title,
    });
  }

  await fetchAndCacheCategories();
  await runSlowPoll(clientManager);
  await runFastPoll(clientManager);

  const slowInterval = setInterval(
    () => runSlowPoll(clientManager),
    YOUTUBE_SLOW_POLL_MS,
  );
  const fastInterval = setInterval(
    () => runFastPoll(clientManager),
    YOUTUBE_FAST_POLL_MS,
  );
  const categoryInterval = setInterval(
    fetchAndCacheCategories,
    YOUTUBE_CATEGORY_POLL_MS,
  );

  clientManager.youtubeIntervals.push(slowInterval, fastInterval, categoryInterval);
  youtubeLog("info", "youtube:bootstrap complete", {
    slowPollMs: YOUTUBE_SLOW_POLL_MS,
    fastPollMs: YOUTUBE_FAST_POLL_MS,
  });
}

module.exports = { bootstrap };
