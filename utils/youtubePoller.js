const axios = require("axios");
const { youtubeLog } = require("./loggers");
const {
  YOUTUBE_STREAM_VALID_HOURS,
  YOUTUBE_QUOTA_COOLDOWN_MS,
  YOUTUBE_RETRY_MAX,
} = require("./constants");

const state = {
  videoId: null,
  title: null,
  thumbnail: null,
  scheduledStart: null,
  streamUrl: null,
  status: "unknown",
  embedSent: false,
  isPolling: false,
  quotaExhaustedUntil: 0,
  usingFallbackKey: false,
};

function getState() {
  return { ...state };
}

function setState(partial) {
  Object.assign(state, partial);
}

function getApiKey(forSearch = false) {
  if (forSearch && state.usingFallbackKey && process.env.YOUTUBE_API_KEY_2) {
    return process.env.YOUTUBE_API_KEY_2;
  }
  return process.env.YOUTUBE_API_KEY;
}

async function withRetry(fn, maxRetries = YOUTUBE_RETRY_MAX) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      const reason = err.response?.data?.error?.errors?.[0]?.reason;

      if (status === 403 && reason === "quotaExceeded") {
        if (process.env.YOUTUBE_API_KEY_2 && !state.usingFallbackKey) {
          youtubeLog(
            "warn",
            "Primary API key quota exceeded, switching to fallback key.",
          );
          setState({ usingFallbackKey: true });
          continue;
        }
        youtubeLog(
          "error",
          "All API keys have exceeded quota. Pausing search.list calls for 24 hours.",
        );
        setState({
          quotaExhaustedUntil: Date.now() + YOUTUBE_QUOTA_COOLDOWN_MS,
        });
        return null;
      }

      if (status === 400 || status === 404) {
        youtubeLog(
          "warn",
          `Non-retryable API error (${status}): ${err.message}`,
        );
        return null;
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        youtubeLog(
          "warn",
          `API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${err.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        youtubeLog(
          "error",
          `API call failed after ${maxRetries + 1} attempts: ${err.message}`,
        );
        return null;
      }
    }
  }
  return null;
}

async function getUpcomingStreams() {
  const key = getApiKey(true);
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  return withRetry(() =>
    axios
      .get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          part: "snippet",
          channelId,
          eventType: "upcoming",
          type: "video",
          key,
        },
      })
      .then((r) => r.data),
  );
}

async function getOngoingStream() {
  const key = getApiKey(true);
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  return withRetry(() =>
    axios
      .get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          part: "snippet",
          channelId,
          eventType: "live",
          type: "video",
          key,
        },
      })
      .then((r) => r.data),
  );
}

async function getVideoStats(videoId) {
  const key = getApiKey(false);
  return withRetry(() =>
    axios
      .get("https://www.googleapis.com/youtube/v3/videos", {
        params: {
          part: "liveStreamingDetails,snippet",
          id: videoId,
          key,
        },
      })
      .then((r) => r.data),
  );
}

function isStreamValid(scheduledStart) {
  const streamDate = new Date(scheduledStart);
  const now = new Date();
  const diffHours = (now - streamDate) / (1000 * 60 * 60);
  return diffHours <= YOUTUBE_STREAM_VALID_HOURS;
}

function getSkipTitles() {
  const builtIn = ["【HORARIO SEMANAL】"];
  const fromEnv = process.env.YOUTUBE_SKIP_TITLES
    ? process.env.YOUTUBE_SKIP_TITLES.split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  return [...builtIn, ...fromEnv];
}

function shouldSkip(title) {
  return getSkipTitles().some((pattern) => title.includes(pattern));
}

function extractStreamData(videoId, statsData) {
  if (!statsData?.items?.length) return null;

  const item = statsData.items[0];
  if (!item.snippet || !item.liveStreamingDetails) return null;

  const details = item.liveStreamingDetails;
  const startTime = details.actualStartTime || details.scheduledStartTime;
  if (!startTime) return null;

  const thumbs = item.snippet.thumbnails;
  const thumbnail =
    thumbs.maxres?.url || thumbs.high?.url || thumbs.default?.url || null;

  return {
    videoId,
    title: item.snippet.title,
    thumbnail,
    scheduledStart: startTime,
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

async function updateWorkflow() {
  if (state.isPolling) {
    youtubeLog(
      "debug",
      "Slow poll skipped — another poll is already in progress.",
    );
    return;
  }

  if (state.quotaExhaustedUntil > Date.now()) {
    const resumeAt = new Date(state.quotaExhaustedUntil).toISOString();
    youtubeLog(
      "warn",
      `Skipping search.list calls — quota exhausted until ${resumeAt}.`,
    );
    return;
  }

  setState({ isPolling: true });
  youtubeLog("info", "===== Slow poll (updateWorkflow) started =====");

  try {
    const now = new Date();
    const candidates = [];
    let ongoingStream = null;

    const ongoingData = await getOngoingStream();
    if (ongoingData?.items?.length) {
      const videoId = ongoingData.items[0].id.videoId;
      youtubeLog("info", `Live stream found with ID: ${videoId}`);
      const stats = await getVideoStats(videoId);
      const streamData = extractStreamData(videoId, stats);
      if (streamData) {
        ongoingStream = streamData;
        candidates.push(streamData);
        youtubeLog("info", `Live stream added: "${streamData.title}"`);
      }
    } else {
      youtubeLog("info", "No streams currently live.");
    }

    const upcomingData = await getUpcomingStreams();
    if (upcomingData?.items?.length) {
      youtubeLog(
        "info",
        `Processing ${upcomingData.items.length} upcoming stream(s).`,
      );
      for (const item of upcomingData.items) {
        try {
          const videoId = item.id.videoId;
          const stats = await getVideoStats(videoId);
          const streamData = extractStreamData(videoId, stats);
          if (!streamData) continue;

          if (shouldSkip(streamData.title)) {
            youtubeLog(
              "info",
              `Skipping "${streamData.title}" (matches skip list).`,
            );
            continue;
          }

          const scheduledDate = new Date(streamData.scheduledStart);
          if (scheduledDate > now || isStreamValid(streamData.scheduledStart)) {
            candidates.push(streamData);
            youtubeLog("info", `Upcoming stream queued: "${streamData.title}"`);
          } else {
            youtubeLog(
              "info",
              `Skipping "${streamData.title}" — too far in the past.`,
            );
          }
        } catch (itemErr) {
          youtubeLog(
            "warn",
            `Error processing upcoming stream: ${itemErr.message}`,
          );
        }
      }
    } else {
      youtubeLog("info", "No upcoming streams found.");
    }

    candidates.sort(
      (a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart),
    );

    const next = ongoingStream || candidates[0] || null;

    if (next) {
      const isNewStream = next.videoId !== state.videoId;
      setState({
        videoId: next.videoId,
        title: next.title,
        thumbnail: next.thumbnail,
        scheduledStart: next.scheduledStart,
        streamUrl: next.streamUrl,
        status: ongoingStream ? "live" : "upcoming",
        embedSent: isNewStream ? false : state.embedSent,
      });
      youtubeLog("info", `Tracking stream: "${next.title}" (${next.videoId})`);
    } else {
      youtubeLog("info", "No streams to track.");
      if (!state.status || state.status === "upcoming") {
        setState({ status: "unknown" });
      }
    }
  } finally {
    setState({ isPolling: false });
    youtubeLog("info", "===== Slow poll (updateWorkflow) complete =====");
  }
}

async function checkWorkflow() {
  if (state.isPolling || !state.videoId) return null;

  const stats = await getVideoStats(state.videoId);
  if (!stats?.items?.length) {
    youtubeLog("debug", `No stats returned for video ${state.videoId}.`);
    return null;
  }

  const details = stats.items[0].liveStreamingDetails;
  if (!details) {
    youtubeLog("debug", `No liveStreamingDetails for video ${state.videoId}.`);
    return null;
  }

  if (details.actualEndTime) {
    youtubeLog(
      "info",
      `Stream ${state.videoId} has ended (actualEndTime set).`,
    );
    return { isLive: false, viewers: 0, endTime: details.actualEndTime };
  }

  if (details.concurrentViewers) {
    return {
      isLive: true,
      viewers: Number(details.concurrentViewers),
      endTime: null,
    };
  }

  if (details.actualStartTime) {
    youtubeLog(
      "info",
      `Stream ${state.videoId} has actualStartTime but no viewers yet — grace period.`,
    );
    return { isLive: true, viewers: 0, endTime: null };
  }

  return { isLive: false, viewers: 0, endTime: null };
}

module.exports = { updateWorkflow, checkWorkflow, getState, setState };
