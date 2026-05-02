const {
  updateWorkflow,
  checkWorkflow,
  getState,
  setState,
} = require("../../utils/youtubePoller");
const streamStartHandler = require("../../events/youtube/streamStart");
const streamEndHandler = require("../../events/youtube/streamEnd");
const {
  updateYoutubeStreamViewers,
  getMostRecentYoutubeStream,
} = require("../../db/youtubeStreams");
const { youtubeLog } = require("../../utils/loggers");
const {
  YOUTUBE_FAST_POLL_MS,
  YOUTUBE_SLOW_POLL_MS,
} = require("../../utils/constants");

async function runSlowPoll(clientManager) {
  try {
    youtubeLog("info", "Running slow poll (updateWorkflow)...");
    await updateWorkflow();
    const state = getState();
    if (state.videoId) {
      youtubeLog(
        "info",
        `Slow poll complete. Tracking: "${state.title}" (${state.videoId}) — status: ${state.status}`,
      );
    } else {
      youtubeLog("info", "Slow poll complete. No streams to track.");
    }
  } catch (err) {
    youtubeLog("error", `Slow poll error: ${err.stack}`);
  }
}

async function runFastPoll(clientManager) {
  try {
    const result = await checkWorkflow();
    if (!result) return;

    const state = getState();

    if (result.endTime && state.status === "live") {
      youtubeLog("info", "Stream end detected. Triggering streamEnd handler.");
      await streamEndHandler(clientManager, result.endTime);
      return;
    }

    if (result.isLive) {
      if (state.status === "live" && state.embedSent) {
        if (result.viewers > 0) {
          await updateYoutubeStreamViewers(state.videoId, result.viewers);
        }
        return;
      }

      if (state.status !== "starting" && state.status !== "live") {
        youtubeLog(
          "info",
          `Stream appears to be starting (grace period). Will confirm on next tick.`,
        );
        setState({ status: "starting" });
        return;
      }

      if (
        (state.status === "starting" || state.status === "upcoming") &&
        !state.embedSent
      ) {
        youtubeLog(
          "info",
          "Stream confirmed live. Triggering streamStart handler.",
        );
        await streamStartHandler(clientManager, state);
      }
    }
  } catch (err) {
    youtubeLog("error", `Fast poll error: ${err.stack}`);
  }
}

async function bootstrap(clientManager) {
  youtubeLog("info", "Bootstrapping YouTube provider...");

  const activeStream = await getMostRecentYoutubeStream();
  if (activeStream && !activeStream.end) {
    setState({
      videoId: activeStream.id,
      title: activeStream.title,
      thumbnail: activeStream.thumbnail,
      status: "live",
      embedSent: true,
    });
    youtubeLog(
      "info",
      `Resuming live stream tracking after restart: "${activeStream.title}" (${activeStream.id})`,
    );
  }

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

  clientManager.youtubeIntervals.push(slowInterval, fastInterval);
  youtubeLog(
    "info",
    "YouTube bootstrap complete. Both poll intervals registered.",
  );
}

module.exports = { bootstrap };
