const axios = require("axios");
const { youtubeLog } = require("./loggers");
const fileUtils = require("./fileUtils");
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
          setState({ usingFallbackKey: true });
          continue;
        }
        setState({
          quotaExhaustedUntil: Date.now() + YOUTUBE_QUOTA_COOLDOWN_MS,
        });
        return null;
      }

      if (status === 400 || status === 404) {
        return null;
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        return null;
      }
    }
  }
  return null;
}

async function fetchAndCacheCategories() {
  youtubeLog("info", "Fetching YouTube categories...");
  const key = getApiKey(false);
  const data = await withRetry(() =>
    axios
      .get("https://www.googleapis.com/youtube/v3/videoCategories", {
        params: {
          part: "snippet",
          regionCode: "US",
          key,
        },
      })
      .then((r) => r.data),
  );

  if (data && data.items) {
    const categories = {};
    for (const item of data.items) {
      categories[item.id] = item.snippet.title;
    }
    fileUtils.writeJSON(
      fileUtils.getFilePath("youtubeCategories.json"),
      categories,
    );
    youtubeLog("info", "YouTube categories cached successfully.");
  } else {
    youtubeLog("warn", "Failed to fetch YouTube categories.");
  }
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

  const categoryId = item.snippet.categoryId;
  const cachedCategories = fileUtils.readJSON(
    fileUtils.getFilePath("youtubeCategories.json"),
    {},
  );
  const categoryName = cachedCategories[categoryId] || "YouTube Live";

  return {
    videoId,
    title: item.snippet.title,
    thumbnail,
    scheduledStart: startTime,
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
    category: categoryName,
  };
}

async function updateWorkflow() {
  if (state.isPolling) {
    return;
  }

  if (state.quotaExhaustedUntil > Date.now()) {
    return;
  }

  setState({ isPolling: true });

  try {
    const now = new Date();
    const candidates = [];
    let ongoingStream = null;

    const ongoingData = await getOngoingStream();
    if (ongoingData?.items?.length) {
      const videoId = ongoingData.items[0].id.videoId;
      const stats = await getVideoStats(videoId);
      const streamData = extractStreamData(videoId, stats);
      if (streamData) {
        ongoingStream = streamData;
        candidates.push(streamData);
      }
    }

    const upcomingData = await getUpcomingStreams();
    if (upcomingData?.items?.length) {
      for (const item of upcomingData.items) {
        try {
          const videoId = item.id.videoId;
          const stats = await getVideoStats(videoId);
          const streamData = extractStreamData(videoId, stats);
          if (!streamData) continue;

          if (shouldSkip(streamData.title)) {
            continue;
          }

          const scheduledDate = new Date(streamData.scheduledStart);
          if (scheduledDate > now || isStreamValid(streamData.scheduledStart)) {
            candidates.push(streamData);
          }
        } catch (itemErr) {}
      }
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
    } else {
      if (!state.status || state.status === "upcoming") {
        setState({ status: "unknown" });
      }
    }
  } finally {
    setState({ isPolling: false });
  }
}

async function checkWorkflow() {
  if (state.isPolling || !state.videoId) return null;

  const stats = await getVideoStats(state.videoId);
  if (!stats?.items?.length) {
    return null;
  }

  const details = stats.items[0].liveStreamingDetails;
  if (!details) {
    return null;
  }

  if (details.actualEndTime) {
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
    return { isLive: true, viewers: 0, endTime: null };
  }

  return { isLive: false, viewers: 0, endTime: null };
}

module.exports = {
  updateWorkflow,
  checkWorkflow,
  getState,
  setState,
  getUpcomingStreams,
  getVideoStats,
  extractStreamData,
  fetchAndCacheCategories,
};
