/**
 * @module utils/twitchSchedule
 * @description
 * Helix wrappers focused on the streamer's published schedule. Used by the
 * stream-end pipeline to decide whether to render a "next streams" follow-up
 * image or a generic "stream ended" image.
 *
 * @typedef {import('./types').ScheduleSegment} ScheduleSegment
 */

"use strict";

const axios = require("axios");
const { getValidTwitchConfig } = require("./twitchToken");
const { twitchLog } = require("./loggers");

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
      `El username debe ser un string. Valor recibido: ${JSON.stringify(username)}`,
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
    if (!data.data.length)
      throw new Error(`Usuario no encontrado: ${username}`);
    return data.data[0].id;
  } catch (err) {
    if (err.response) {
      const twitchError = err.response.data;
      twitchLog("error", "twitchSchedule:getBroadcasterId helix-error", {
        username,
        twitchError,
      });
      throw new Error(
        `Error al obtener broadcasterId para "${username}": ${JSON.stringify(twitchError)}`,
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
 * @param {import('@twurple/api').ApiClient|null} twitchApiClient
 * @param {string} categoryName
 * @returns {Promise<string|null>}
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
 * Fetch the streamer's Helix schedule and filter it down to segments that fall
 * inside the current week (now → next Sunday 23:59:59 UTC). Each segment is
 * decorated with a pre-resolved box-art URL when available.
 *
 * @async
 * @param {string} username - Twitch login (no leading `#`).
 * @param {import('@twurple/api').ApiClient} twitchApiClient - Used to resolve box art for each segment.
 * @returns {Promise<ScheduleSegment[]>}
 * @throws {Error} On invalid input or non-recoverable Helix errors.
 */
async function getStreamerScheduleThisWeek(username, twitchApiClient) {
  if (typeof username !== "string") {
    throw new Error(
      `El username debe ser un string. Valor recibido: ${JSON.stringify(username)}`,
    );
  }
  twitchLog("debug", "twitchSchedule:getStreamerScheduleThisWeek", { username });
  const twitchConfig = await getValidTwitchConfig();
  const clientId = twitchConfig.CLIENT_ID;
  const accessToken = twitchConfig.ACCESS_TOKEN;

  const broadcasterId = await getBroadcasterId(username, clientId, accessToken);

  const now = new Date();
  const endOfWeek = new Date(now);
  const dayOfWeek = now.getUTCDay();
  const daysUntilSunday = (7 - dayOfWeek) % 7;
  endOfWeek.setUTCDate(now.getUTCDate() + daysUntilSunday);
  endOfWeek.setUTCHours(23, 59, 59, 999);

  const startTimeForAPI = now.toISOString();
  const url = `https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}&start_time=${startTimeForAPI}`;
  const res = await axios.get(url, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${accessToken}` },
  });

  const data = res.data;
  const segments = (data?.data?.segments || []).filter((seg) => {
    const start = new Date(seg.start_time);
    return start >= now && start <= endOfWeek;
  });

  twitchLog("info", "twitchSchedule:segments fetched", {
    broadcasterId,
    total: data?.data?.segments?.length || 0,
    thisWeek: segments.length,
  });

  const result = [];
  for (const seg of segments) {
    const category = seg.category?.name || "Sin categoría";
    let gameBoxArtUrl = null;
    if (category !== "Sin categoría" && twitchApiClient) {
      gameBoxArtUrl = await getGameBoxArtUrlByCategoryName(
        twitchApiClient,
        category,
      );
    }
    result.push({
      title: seg.title,
      category,
      start: new Date(seg.start_time).toISOString(),
      end: new Date(seg.end_time).toISOString(),
      gameBoxArtUrl,
    });
  }
  return result;
}

module.exports = { getStreamerScheduleThisWeek };
