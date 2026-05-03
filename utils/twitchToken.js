/**
 * @module utils/twitchToken
 * @description
 * Owns the lifecycle of the persisted Twitch OAuth token pair stored in
 * `data/twitch.json`. Exposes a single `getValidTwitchConfig()` that returns a
 * never-stale `{ ACCESS_TOKEN, REFRESH_TOKEN, CLIENT_ID, VALID_UNTIL }` payload —
 * refreshing transparently against `twitchtokengenerator.com` whenever the
 * stored token is missing, expired, or rejected by `oauth2/validate`.
 *
 * @typedef {import('./types').TwitchConfig} TwitchConfig
 */

"use strict";

const fileUtils = require("./fileUtils");
const axios = require("axios");
const { twitchLog } = require("./loggers");

/**
 * Absolute path to the token cache file inside `data/`.
 * @type {string}
 * @constant
 */
const twitchConfigPath = fileUtils.getFilePath("twitch.json");

/**
 * Exchange a refresh token for a fresh access/refresh token pair using
 * twitchtokengenerator.com's refresh endpoint.
 *
 * @async
 * @param {string} token - The refresh token to exchange.
 * @returns {Promise<{ success: boolean, token?: string, refresh?: string, client_id?: string }>}
 *   Raw response payload. `success === false` indicates the refresh token is invalid.
 */
async function refreshToken(token) {
  twitchLog("debug", "twitchToken:refreshToken request");
  const response = await axios.get(
    `https://twitchtokengenerator.com/api/refresh/${token}`,
  );
  return response.data;
}

/**
 * Probe Twitch's OAuth validate endpoint to confirm an access token is still good.
 * Returns `false` on any non-200 response or network error so callers treat
 * uncertainty as "needs refresh".
 *
 * @async
 * @param {string} accessToken
 * @returns {Promise<boolean>} `true` only when Twitch accepted the token.
 */
async function validateToken(accessToken) {
  try {
    const response = await axios.get("https://id.twitch.tv/oauth2/validate", {
      headers: {
        Authorization: `OAuth ${accessToken}`,
      },
      validateStatus: () => true,
    });
    twitchLog("debug", "twitchToken:validateToken result", {
      status: response.status,
    });
    return response.status === 200;
  } catch (err) {
    twitchLog("warn", "twitchToken:validateToken errored", {
      err: err.message,
    });
    return false;
  }
}

/**
 * Load the cached token pair, refreshing it on disk when needed. The result is
 * always usable: callers should treat the returned object as authoritative for
 * the lifetime of the current request.
 *
 * @async
 * @returns {Promise<TwitchConfig>}
 * @throws {Error} When the refresh endpoint reports failure (the refresh token
 *   itself is invalid and a human needs to re-authorize the bot).
 */
async function getValidTwitchConfig() {
  twitchLog("debug", "twitchToken:getValidTwitchConfig start");
  let twitchConfig = fileUtils.readJSON(twitchConfigPath, {
    ACCESS_TOKEN: "",
    REFRESH_TOKEN: "",
    CLIENT_ID: "",
    VALID_UNTIL: "",
  });

  const now = Date.now();
  let validUntil = twitchConfig.VALID_UNTIL
    ? new Date(twitchConfig.VALID_UNTIL).getTime()
    : 0;

  let tokenValid = false;
  if (twitchConfig.ACCESS_TOKEN) {
    tokenValid = await validateToken(twitchConfig.ACCESS_TOKEN);
  }

  if (
    !twitchConfig.ACCESS_TOKEN ||
    !twitchConfig.REFRESH_TOKEN ||
    now >= validUntil ||
    !tokenValid
  ) {
    twitchLog("info", "twitchToken:refreshing", {
      reason: !twitchConfig.ACCESS_TOKEN
        ? "no-access-token"
        : !twitchConfig.REFRESH_TOKEN
          ? "no-refresh-token"
          : now >= validUntil
            ? "expired"
            : "invalid",
    });
    const response = await refreshToken(twitchConfig.REFRESH_TOKEN);
    if (response.success) {
      twitchConfig.ACCESS_TOKEN = response.token;
      twitchConfig.REFRESH_TOKEN = response.refresh;
      twitchConfig.CLIENT_ID = response.client_id;
      const { TOKEN_VALIDITY_MS } = require("./constants");
      twitchConfig.VALID_UNTIL = new Date(
        now + TOKEN_VALIDITY_MS,
      ).toISOString();
      fileUtils.writeJSON(twitchConfigPath, twitchConfig);
      twitchLog("info", "twitchToken:refresh ok", {
        validUntil: twitchConfig.VALID_UNTIL,
      });
    } else {
      twitchLog("error", "twitchToken:refresh failed", {
        response,
      });
      throw new Error(
        `Twitch token refresh failed. The refresh token may be invalid or expired. Response: ${JSON.stringify(response)}`,
      );
    }
  } else {
    twitchLog("debug", "twitchToken:cached token valid", {
      validUntil: twitchConfig.VALID_UNTIL,
    });
  }
  return twitchConfig;
}

module.exports = {
  getValidTwitchConfig,
};
