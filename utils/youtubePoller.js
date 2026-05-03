/**
 * @module utils/youtubePoller
 * @description
 * Stateful poller that drives the YouTube live-stream announcement pipeline.
 * Holds in-memory state (the current tracked videoId, status, embed flag,
 * quota cooldown) plus the API helpers used by the slow/fast polls in
 * {@link module:handlers/youtube/startup}.
 *
 * Quota strategy:
 *  - Two API keys are supported. The primary (`YOUTUBE_API_KEY`) is used for
 *    everything except `search.list` calls. When `search.list` returns
 *    `quotaExceeded` we transparently flip to `YOUTUBE_API_KEY_2` for searches
 *    only — `videos.list` keeps using the primary key.
 *  - Once both keys are exhausted we set `quotaExhaustedUntil` to "now + 24 h"
 *    so future calls short-circuit until the daily window resets.
 *
 * @typedef {import('./types').YouTubeState} YouTubeState
 * @typedef {import('./types').YouTubeStreamData} YouTubeStreamData
 * @typedef {import('./types').YouTubeCheckResult} YouTubeCheckResult
 */

"use strict";

const axios = require("axios");
const { youtubeLog } = require("./loggers");
const fileUtils = require("./fileUtils");
const {
  YOUTUBE_STREAM_VALID_HOURS,
  YOUTUBE_QUOTA_COOLDOWN_MS,
  YOUTUBE_RETRY_MAX,
} = require("./constants");

/**
 * Mutable singleton state for the poller. Treat as private to this module —
 * outside callers should go through {@link getState} / {@link setState}.
 * @type {YouTubeState}
 */
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

/**
 * Return a shallow copy of the current state so callers can safely read it
 * without risking accidental mutation.
 * @returns {YouTubeState}
 */
function getState() {
  return { ...state };
}

/**
 * Merge a partial state update into the singleton state.
 * @param {Partial<YouTubeState>} partial
 * @returns {void}
 */
function setState(partial) {
  Object.assign(state, partial);
}

/**
 * Pick the right API key for a given call. Search calls flip to the fallback
 * key once the primary has hit its quota; everything else stays on the primary.
 *
 * @param {boolean} [forSearch=false] - True when picking a key for `search.list`.
 * @returns {string|undefined} The selected API key.
 */
function getApiKey(forSearch = false) {
  if (forSearch && state.usingFallbackKey && process.env.YOUTUBE_API_KEY_2) {
    return process.env.YOUTUBE_API_KEY_2;
  }
  return process.env.YOUTUBE_API_KEY;
}

/**
 * Wrap an async API call with exponential-backoff retry and quota awareness.
 * Returns `null` (instead of throwing) on:
 *  - 400/404 responses (caller-fixable, no point retrying),
 *  - exhausted retries,
 *  - permanent quota exhaustion (sets `quotaExhaustedUntil`).
 *
 * @template T
 * @async
 * @param {() => Promise<T>} fn - Function to call (must throw on error).
 * @param {number} [maxRetries=YOUTUBE_RETRY_MAX]
 * @returns {Promise<T|null>}
 */
async function withRetry(fn, maxRetries = YOUTUBE_RETRY_MAX) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      const reason = err.response?.data?.error?.errors?.[0]?.reason;

      if (status === 403 && reason === "quotaExceeded") {
        if (process.env.YOUTUBE_API_KEY_2 && !state.usingFallbackKey) {
          youtubeLog("warn", "youtubePoller:quota primary-exhausted, switching to fallback key");
          setState({ usingFallbackKey: true });
          continue;
        }
        youtubeLog("error", "youtubePoller:quota exhausted on all keys", {
          cooldownMs: YOUTUBE_QUOTA_COOLDOWN_MS,
        });
        setState({
          quotaExhaustedUntil: Date.now() + YOUTUBE_QUOTA_COOLDOWN_MS,
        });
        return null;
      }

      if (status === 400 || status === 404) {
        youtubeLog("warn", "youtubePoller:request gave-up", {
          status,
          reason,
        });
        return null;
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        youtubeLog("debug", "youtubePoller:retrying", {
          attempt: attempt + 1,
          delay,
          status,
          reason,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        youtubeLog("error", "youtubePoller:retries exhausted", {
          status,
          reason,
          err: err.message,
        });
        return null;
      }
    }
  }
  return null;
}

/**
 * Refresh the cached `id → categoryName` map from `videoCategories.list`. The
 * cache is written to `data/youtubeCategories.json` and read by
 * {@link extractStreamData}.
 *
 * @async
 * @returns {Promise<void>}
 */
async function fetchAndCacheCategories() {
  youtubeLog("info", "youtubePoller:fetchAndCacheCategories start");
  const key = getApiKey(false);
  const data = await withRetry(() =>
    axios
      .get("https://www.googleapis.com/youtube/v3/videoCategories", {
        params: {
          part: "snippet",
          regionCode: "ES",
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
    youtubeLog("info", "youtubePoller:categories cached", {
      count: Object.keys(categories).length,
    });
  } else {
    youtubeLog("warn", "youtubePoller:fetchAndCacheCategories failed");
  }
}

/**
 * `search.list` for `eventType=upcoming` — high-quota call.
 * @async
 * @returns {Promise<any|null>} Raw API response or `null` on quota/error.
 */
async function getUpcomingStreams() {
  const key = getApiKey(true);
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  youtubeLog("debug", "youtubePoller:getUpcomingStreams", { channelId });
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

/**
 * `search.list` for `eventType=live` — high-quota call.
 * @async
 * @returns {Promise<any|null>} Raw API response or `null` on quota/error.
 */
async function getOngoingStream() {
  const key = getApiKey(true);
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  youtubeLog("debug", "youtubePoller:getOngoingStream", { channelId });
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

/**
 * `videos.list` for a single videoId — low quota cost. Used by the fast poll
 * to track `liveStreamingDetails` once a candidate has been picked.
 *
 * @async
 * @param {string} videoId
 * @returns {Promise<any|null>}
 */
async function getVideoStats(videoId) {
  const key = getApiKey(false);
  youtubeLog("debug", "youtubePoller:getVideoStats", { videoId });
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

/**
 * Decide whether a scheduled-start time is recent enough to keep tracking.
 *
 * @param {string} scheduledStart - ISO-8601 timestamp.
 * @returns {boolean} `true` when the scheduled start is within
 *   {@link YOUTUBE_STREAM_VALID_HOURS} hours of now.
 */
function isStreamValid(scheduledStart) {
  const streamDate = new Date(scheduledStart);
  const now = new Date();
  const diffHours = (now - streamDate) / (1000 * 60 * 60);
  return diffHours <= YOUTUBE_STREAM_VALID_HOURS;
}

/**
 * Build the list of title patterns that should be skipped when picking a
 * candidate stream. Combines a built-in list ("【HORARIO SEMANAL】") with the
 * comma-separated `YOUTUBE_SKIP_TITLES` env var.
 *
 * @returns {string[]}
 */
function getSkipTitles() {
  const builtIn = ["【HORARIO SEMANAL】"];
  const fromEnv = process.env.YOUTUBE_SKIP_TITLES
    ? process.env.YOUTUBE_SKIP_TITLES.split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  return [...builtIn, ...fromEnv];
}

/**
 * @param {string} title
 * @returns {boolean} `true` when `title` matches any pattern from {@link getSkipTitles}.
 */
function shouldSkip(title) {
  return getSkipTitles().some((pattern) => title.includes(pattern));
}

/**
 * Reduce a `videos.list` response item to the {@link YouTubeStreamData} shape
 * the rest of the codebase expects. Returns `null` when the response is missing
 * a snippet, `liveStreamingDetails`, or any usable start time.
 *
 * @param {string} videoId
 * @param {any} statsData - Raw `videos.list` response.
 * @returns {YouTubeStreamData|null}
 */
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

/**
 * Slow-poll core: search for live and upcoming streams on the channel, score
 * candidates, and update state with the best one. Re-entrant: the `isPolling`
 * lock prevents two concurrent updates from racing on `setState`.
 *
 * @async
 * @returns {Promise<void>}
 */
async function updateWorkflow() {
  if (state.isPolling) {
    youtubeLog("debug", "youtubePoller:updateWorkflow already-running");
    return;
  }

  if (state.quotaExhaustedUntil > Date.now()) {
    youtubeLog("debug", "youtubePoller:updateWorkflow quota-cooldown", {
      until: new Date(state.quotaExhaustedUntil).toISOString(),
    });
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
        youtubeLog("debug", "youtubePoller:updateWorkflow ongoing-found", {
          videoId,
        });
      }
    }

    const upcomingData = await getUpcomingStreams();
    if (upcomingData?.items?.length) {
      youtubeLog("debug", "youtubePoller:updateWorkflow upcoming-count", {
        count: upcomingData.items.length,
      });
      for (const item of upcomingData.items) {
        try {
          const videoId = item.id.videoId;
          const stats = await getVideoStats(videoId);
          const streamData = extractStreamData(videoId, stats);
          if (!streamData) continue;

          if (shouldSkip(streamData.title)) {
            youtubeLog("debug", "youtubePoller:skip title-pattern", {
              videoId,
              title: streamData.title,
            });
            continue;
          }

          const scheduledDate = new Date(streamData.scheduledStart);
          if (scheduledDate > now || isStreamValid(streamData.scheduledStart)) {
            candidates.push(streamData);
          }
        } catch (itemErr) {
          youtubeLog("warn", "youtubePoller:upcoming-item failed", {
            err: itemErr.message,
          });
        }
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
      youtubeLog("info", "youtubePoller:state updated", {
        videoId: next.videoId,
        status: ongoingStream ? "live" : "upcoming",
        isNewStream,
      });
    } else {
      if (!state.status || state.status === "upcoming") {
        setState({ status: "unknown" });
        youtubeLog("debug", "youtubePoller:state reset to unknown");
      }
    }
  } finally {
    setState({ isPolling: false });
  }
}

/**
 * Fast-poll core: re-fetch the currently tracked video and report whether it's
 * live, has ended, and how many viewers it has. Returns `null` when there's
 * nothing tracked or the API call failed.
 *
 * @async
 * @returns {Promise<YouTubeCheckResult|null>}
 */
async function checkWorkflow() {
  if (state.isPolling || !state.videoId) return null;

  const stats = await getVideoStats(state.videoId);
  if (!stats?.items?.length) {
    youtubeLog("debug", "youtubePoller:checkWorkflow video-missing", {
      videoId: state.videoId,
    });
    return null;
  }

  const details = stats.items[0].liveStreamingDetails;
  if (!details) {
    youtubeLog("debug", "youtubePoller:checkWorkflow no-live-details", {
      videoId: state.videoId,
    });
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
