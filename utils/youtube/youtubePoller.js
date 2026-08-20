/**
 * @module utils/youtubePoller
 * @description
 * Stateful poller that drives the YouTube live-stream announcement pipeline.
 * Holds in-memory state (the current tracked videoId, status, embed flag,
 * quota cooldown, and upcoming streams cache) plus the API helpers used by
 * the slow/fast polls in `handlers/youtube/startup`.
 *
 * Streams can be blacklisted via the `YOUTUBE_BLACKLIST_IDS` environment
 * variable (comma-separated list of video IDs). Blacklisted videos are
 * filtered out during polling and never announced.
 *
 * @typedef {import('../core/types').YouTubeState} YouTubeState
 * @typedef {import('../core/types').YouTubeStreamData} YouTubeStreamData
 * @typedef {import('../core/types').YouTubeCheckResult} YouTubeCheckResult
 */

import axios from "axios";
import { youtubeLog } from "../core/loggers.js";
import * as fileUtils from "../helpers/fileUtils.js";
import { updateStreamViewers } from "../../db/streams.js";
import {
  YOUTUBE_QUOTA_COOLDOWN_MS,
  YOUTUBE_RETRY_MAX,
} from "../core/constants.js";

/**
 * Mutable singleton state for the poller.
 * @type {YouTubeState & { upcomingStreams: YouTubeStreamData[] }}
 */
const state = {
  videoId: null,
  title: null,
  thumbnail: null,
  scheduledStart: null,
  streamUrl: null,
  category: null,
  status: "unknown",
  embedSent: false,
  isPolling: false,
  quotaExhaustedUntil: 0,
  usingFallbackKey: false,
  upcomingStreams: [],
};

/**
 * Return a shallow copy of the current state.
 *
 * @returns {YouTubeState & { upcomingStreams: YouTubeStreamData[] }}
 */
export function getState() {
  return { ...state };
}

/**
 * Merge a partial state update into the singleton state.
 *
 * @param {Partial<YouTubeState & { upcomingStreams: YouTubeStreamData[] }>} partial
 * @returns {void}
 */
export function setState(partial) {
  Object.assign(state, partial);
}

/**
 * Return the API key the next request should use. Prefers the fallback key
 * (`YOUTUBE_API_KEY_2`) once `state.usingFallbackKey` is set after a primary
 * `quotaExceeded` 403 — the key choice is no longer endpoint-specific because
 * YouTube's daily 10 000 unit cap is per project and shared across every
 * endpoint, not per method.
 *
 * **Always call this from inside the request closure** so each retry inside
 * `withRetry` re-reads the current state. Capturing the return value before
 * the retry loop pins the lambda to the dead key and the fallback never
 * actually gets hit.
 *
 * @returns {string|undefined} The selected API key.
 */
function getApiKey() {
  // Daily quota auto-recovery: once the 24 h cooldown elapses, drop the
  // fallback flag so the next call retries the primary key from scratch.
  // Otherwise the in-memory flag would pin us to the fallback forever.
  if (
    state.quotaExhaustedUntil > 0 &&
    state.quotaExhaustedUntil <= Date.now()
  ) {
    setState({ quotaExhaustedUntil: 0, usingFallbackKey: false });
    youtubeLog(
      "info",
      "youtubePoller:quota cooldown ended, resetting key state",
    );
  }
  if (state.usingFallbackKey && process.env.YOUTUBE_API_KEY_2) {
    return process.env.YOUTUBE_API_KEY_2;
  }
  return process.env.YOUTUBE_API_KEY;
}

/**
 * Wrap an async API call with exponential-backoff retry and quota awareness.
 *
 * @template T
 * @async
 * @param {() => Promise<T>} fn - Function to call (must throw on error).
 * @param {number} [maxRetries=YOUTUBE_RETRY_MAX] - Max retry attempts.
 * @returns {Promise<T|null>} Null on 400/404 responses or exhausted retries/quota.
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
          youtubeLog(
            "warn",
            "youtubePoller:quota primary-exhausted, switching to fallback key",
          );
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
        youtubeLog("warn", "youtubePoller:request gave-up", { status, reason });
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
 * Refresh the cached `id -> categoryName` map from `videoCategories.list`.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function fetchAndCacheCategories() {
  youtubeLog("info", "youtubePoller:fetchAndCacheCategories start");
  const data = await withRetry(() =>
    axios
      .get("https://www.googleapis.com/youtube/v3/videoCategories", {
        params: { part: "snippet", regionCode: "ES", key: getApiKey() },
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
 *
 * @async
 * @returns {Promise<any|null>} Raw API response.
 */
export async function getUpcomingStreams() {
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
          key: getApiKey(),
        },
      })
      .then((r) => r.data),
  );
}

/**
 * `search.list` for `eventType=live` — high-quota call.
 *
 * @async
 * @returns {Promise<any|null>} Raw API response.
 */
async function getOngoingStream() {
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
          key: getApiKey(),
        },
      })
      .then((r) => r.data),
  );
}

/**
 * `videos.list` for a single videoId — low quota cost.
 *
 * @async
 * @param {string} videoId - The YouTube video ID.
 * @returns {Promise<any|null>} Raw API response.
 */
export async function getVideoStats(videoId) {
  youtubeLog("debug", "youtubePoller:getVideoStats", { videoId });
  return withRetry(() =>
    axios
      .get("https://www.googleapis.com/youtube/v3/videos", {
        params: {
          part: "liveStreamingDetails,snippet",
          id: videoId,
          key: getApiKey(),
        },
      })
      .then((r) => r.data),
  );
}

/**
 * Build the list of title patterns that should be skipped.
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
 * Build the list of video IDs that should be blacklisted and ignored completely.
 *
 * @returns {string[]}
 */
export function getBlacklistedVideoIds() {
  const fromEnv = process.env.YOUTUBE_BLACKLIST_IDS
    ? process.env.YOUTUBE_BLACKLIST_IDS.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
  return fromEnv;
}

/**
 * Checks if the video ID is blacklisted.
 *
 * @param {string} videoId - The video ID.
 * @returns {boolean} True if the video should be ignored.
 */
export function isBlacklisted(videoId) {
  return getBlacklistedVideoIds().includes(videoId);
}

/**
 * Checks if the title matches any pattern to skip.
 *
 * @param {string} title - The stream title.
 * @returns {boolean} True if the stream should be skipped.
 */
function shouldSkip(title) {
  return getSkipTitles().some((pattern) => title.includes(pattern));
}

/**
 * Reduce a `videos.list` response item to the YouTubeStreamData shape.
 *
 * @param {string} videoId - The video ID.
 * @param {any} statsData - Raw API response.
 * @returns {YouTubeStreamData|null} Parsed data or null.
 */
export function extractStreamData(videoId, statsData) {
  if (!statsData?.items?.length) return null;

  const item = statsData.items[0];
  if (!item.snippet || !item.liveStreamingDetails) return null;

  const details = item.liveStreamingDetails;
  const startTime = details.scheduledStartTime;
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
 * candidates, and update state with the best one. Also caches upcoming streams.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function updateWorkflow() {
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
    const upcomingCache = [];
    let ongoingStream = null;

    // Skip the live-discovery search.list when we are already tracking a live
    // stream — the fast poll handles the active stream, and the channel can
    // only broadcast one live at a time. Saves 100 quota per slow poll for the
    // duration of every live. Discovery still runs in any other state
    // (`unknown`, `upcoming`, `ended`) so unscheduled-live detection survives.
    if (state.status !== "live") {
      const ongoingData = await getOngoingStream();
      if (ongoingData?.items?.length) {
        const videoId = ongoingData.items[0].id.videoId;
        if (isBlacklisted(videoId)) {
          youtubeLog(
            "debug",
            "youtubePoller:updateWorkflow ongoing-blacklisted",
            {
              videoId,
            },
          );
        } else {
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
      }
    } else {
      youtubeLog(
        "debug",
        "youtubePoller:updateWorkflow ongoing-skip already-live",
        {
          videoId: state.videoId,
        },
      );
    }

    const upcomingData = await getUpcomingStreams();
    if (upcomingData?.items?.length) {
      youtubeLog("debug", "youtubePoller:updateWorkflow upcoming-count", {
        count: upcomingData.items.length,
      });
      for (const item of upcomingData.items) {
        try {
          const videoId = item.id.videoId;

          if (isBlacklisted(videoId)) {
            youtubeLog("debug", "youtubePoller:skip blacklisted", {
              videoId,
            });
            continue;
          }

          const stats = await getVideoStats(videoId);
          const streamData = extractStreamData(videoId, stats);
          if (!streamData) continue;

          const liveBroadcastContent =
            stats?.items?.[0]?.snippet?.liveBroadcastContent;
          if (
            liveBroadcastContent !== "upcoming" &&
            liveBroadcastContent !== "live"
          ) {
            youtubeLog("debug", "youtubePoller:skip non-upcoming", {
              videoId,
              liveBroadcastContent,
            });
            continue;
          }

          if (shouldSkip(streamData.title)) {
            youtubeLog("debug", "youtubePoller:skip title-pattern", {
              videoId,
              title: streamData.title,
            });
            continue;
          }

          const scheduledDate = new Date(streamData.scheduledStart);
          if (scheduledDate > now) {
            candidates.push(streamData);
            upcomingCache.push(streamData);
          }
        } catch (itemErr) {
          youtubeLog("warn", "youtubePoller:upcoming-item failed", {
            err: itemErr.message,
          });
        }
      }
    }

    // search.list(eventType=upcoming) is unreliable and sometimes omits streams
    // that are genuinely still scheduled. For every stream that was in the
    // previous cache but is absent from these results, do a cheap videos.list
    // call to confirm it's actually gone before dropping it.
    const newCacheIds = new Set(upcomingCache.map((s) => s.videoId));
    for (const prev of state.upcomingStreams) {
      if (newCacheIds.has(prev.videoId)) continue;
      const verifyStats = await getVideoStats(prev.videoId);
      const liveBroadcastContent =
        verifyStats?.items?.[0]?.snippet?.liveBroadcastContent;
      const verifiedStart =
        verifyStats?.items?.[0]?.liveStreamingDetails?.scheduledStartTime;
      if (
        liveBroadcastContent === "upcoming" &&
        verifiedStart &&
        new Date(verifiedStart) > now
      ) {
        youtubeLog(
          "info",
          "youtubePoller:updateWorkflow search-miss recovered",
          { videoId: prev.videoId },
        );
        upcomingCache.push(prev);
        newCacheIds.add(prev.videoId);
        if (!candidates.find((c) => c.videoId === prev.videoId)) {
          candidates.push(prev);
        }
      } else if (liveBroadcastContent === "live" && !ongoingStream) {
        youtubeLog(
          "info",
          "youtubePoller:updateWorkflow search-miss live-promoted",
          { videoId: prev.videoId },
        );
        const liveData = extractStreamData(prev.videoId, verifyStats) ?? {
          ...prev,
        };
        ongoingStream = liveData;
        if (!candidates.find((c) => c.videoId === prev.videoId)) {
          candidates.push(liveData);
        }
      } else {
        youtubeLog(
          "debug",
          "youtubePoller:updateWorkflow search-miss dropped",
          {
            videoId: prev.videoId,
            liveBroadcastContent,
          },
        );
      }
    }

    candidates.sort(
      (a, b) =>
        new Date(a.scheduledStart).getTime() -
        new Date(b.scheduledStart).getTime(),
    );
    upcomingCache.sort(
      (a, b) =>
        new Date(a.scheduledStart).getTime() -
        new Date(b.scheduledStart).getTime(),
    );
    setState({ upcomingStreams: upcomingCache });

    // When already live and the live-search was skipped (ongoingStream is null),
    // don't replace the tracked stream with an upcoming candidate — fast poll owns the live state.
    const next =
      state.status === "live" && !ongoingStream
        ? null
        : ongoingStream || candidates[0] || null;

    if (next) {
      const isNewStream = next.videoId !== state.videoId;
      setState({
        videoId: next.videoId,
        title: next.title,
        thumbnail: next.thumbnail,
        scheduledStart: next.scheduledStart,
        streamUrl: next.streamUrl,
        category: next.category,
        status: ongoingStream ? "live" : "upcoming",
        embedSent: isNewStream ? false : state.embedSent,
      });
      youtubeLog("info", "youtubePoller:state updated", {
        videoId: next.videoId,
        status: ongoingStream ? "live" : "upcoming",
        isNewStream,
        scheduledStart: next.scheduledStart,
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
 * live, has ended, and how many viewers it has.
 *
 * @async
 * @returns {Promise<YouTubeCheckResult|null>} Data object or null.
 */
export async function checkWorkflow() {
  if (state.isPolling || !state.videoId) return null;

  if (state.quotaExhaustedUntil > Date.now()) {
    youtubeLog("debug", "youtubePoller:checkWorkflow quota-cooldown", {
      until: new Date(state.quotaExhaustedUntil).toISOString(),
      videoId: state.videoId,
    });
    return null;
  }

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
    const viewerCount = Number(details.concurrentViewers);
    try {
      await updateStreamViewers(state.videoId, viewerCount);
    } catch (err) {
      youtubeLog(
        "warn",
        "youtubePoller:checkWorkflow updateStreamViewers failed",
        { err: err.message, videoId: state.videoId },
      );
    }
    return { isLive: true, viewers: viewerCount, endTime: null };
  }

  if (details.actualStartTime) {
    return { isLive: true, viewers: 0, endTime: null };
  }

  return { isLive: false, viewers: 0, endTime: null };
}
