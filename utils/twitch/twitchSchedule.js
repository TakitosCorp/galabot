/**
 * @module utils/twitchSchedule
 * @description
 * Helix wrappers focused on the streamer's published schedule. Used by the
 * stream-end pipeline to decide whether to render a "next streams" follow-up
 * image or a generic "stream ended" image, and by the Discord event sync to
 * create Guild Scheduled Events for all upcoming segments.
 *
 * @typedef {import('./types').ScheduleSegment} ScheduleSegment
 */

import axios from "axios";
import { getValidTwitchConfig } from "./twitchToken.js";
import { twitchLog } from "../core/loggers.js";

/**
 * Resolve a Twitch login name to its broadcaster id via Helix `/users`.
 *
 * @async
 * @param {string} username - Twitch login (no leading `#`).
 * @param {string} clientId - Twitch app client id from the cached token.
 * @param {string} accessToken - Twitch user access token.
 * @returns {Promise<string>} The broadcaster id string.
 * @throws {Error} When the username is missing/invalid or Helix returns an error.
 */
async function getBroadcasterId(username, clientId, accessToken) {
  if (typeof username !== "string") {
    throw new Error(
      `Username must be a string. Value received: ${JSON.stringify(username)}`,
    );
  }
  twitchLog("debug", "twitchSchedule:getBroadcasterId", { username });
  const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`;
  try {
    const res = await axios.get(url, {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = res.data;
    if (!data.data.length) throw new Error(`User not found: ${username}`);
    return data.data[0].id;
  } catch (err) {
    if (err.response) {
      const twitchError = err.response.data;
      twitchLog("error", "twitchSchedule:getBroadcasterId helix-error", {
        username,
        twitchError,
      });
      throw new Error(
        `Error obtaining broadcasterId for "${username}": ${JSON.stringify(twitchError)}`,
        { cause: err },
      );
    }
    throw err;
  }
}

/**
 * Resolve a category name to a high-resolution box-art URL via the Twurple
 * API client. Returns `null` on lookup failure or missing category.
 *
 * @async
 * @param {import('@twurple/api').ApiClient|null} twitchApiClient - The Twurple API client.
 * @param {string} categoryName - The category name to look up.
 * @returns {Promise<string|null>} The box art URL or null.
 */
async function getGameBoxArtUrlByCategoryName(twitchApiClient, categoryName) {
  if (!twitchApiClient || !categoryName) return null;
  try {
    const game = await twitchApiClient.games.getGameByName(categoryName);
    if (game) {
      return game.getBoxArtUrl(432, 576);
    }
    return null;
  } catch (err) {
    twitchLog("warn", "twitchSchedule:getGameBoxArtUrlByCategoryName failed", {
      categoryName,
      err: err.message,
    });
    return null;
  }
}

/**
 * Fetch all future scheduled segments for the streamer, sorted chronologically.
 *
 * @async
 * @param {string} username - Twitch login (no leading `#`).
 * @param {import('@twurple/api').ApiClient} twitchApiClient - Used to resolve box art for each segment.
 * @returns {Promise<ScheduleSegment[]>} Array of scheduled segments.
 * @throws {Error} On invalid input or non-recoverable Helix errors.
 */
export async function getStreamerScheduleThisWeek(username, twitchApiClient) {
  if (typeof username !== "string") {
    throw new Error(
      `Username must be a string. Value received: ${JSON.stringify(username)}`,
    );
  }
  twitchLog("debug", "twitchSchedule:getStreamerScheduleThisWeek", {
    username,
  });
  const twitchConfig = await getValidTwitchConfig();
  const clientId = twitchConfig.CLIENT_ID;
  const accessToken = twitchConfig.ACCESS_TOKEN;

  const broadcasterId = await getBroadcasterId(username, clientId, accessToken);
  const now = new Date();
  const startTimeForAPI = now.toISOString();
  const url = `https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}&start_time=${startTimeForAPI}`;
  const res = await axios.get(url, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${accessToken}` },
  });

  const data = res.data;
  const segments = (data?.data?.segments || []).filter(
    (seg) => new Date(seg.start_time) >= now,
  );

  twitchLog("info", "twitchSchedule:segments fetched", {
    broadcasterId,
    total: data?.data?.segments?.length || 0,
    upcoming: segments.length,
  });

  const result = [];
  for (const seg of segments) {
    const category = seg.category?.name || "No category";
    let gameBoxArtUrl = null;
    if (category !== "No category" && twitchApiClient) {
      gameBoxArtUrl = await getGameBoxArtUrlByCategoryName(
        twitchApiClient,
        category,
      );
    }
    result.push({
      id: seg.id,
      title: seg.title,
      category,
      start: new Date(seg.start_time).toISOString(),
      end: new Date(seg.end_time).toISOString(),
      gameBoxArtUrl,
    });
  }

  result.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  return result;
}
