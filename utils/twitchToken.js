const fileUtils = require("./fileUtils");
const axios = require("axios");

const twitchConfigPath = fileUtils.getFilePath("twitch.json");

// Refreshes the Twitch token using the refresh token.
async function refreshToken(refreshToken) {
  const url = `https://twitchtokengenerator.com/api/refresh/${refreshToken}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Validates the Twitch access token.
async function validateToken(accessToken) {
  try {
    const response = await axios.get("https://id.twitch.tv/oauth2/validate", {
      headers: {
        Authorization: `OAuth ${accessToken}`,
      },
      validateStatus: () => true,
    });
    return response.status === 200;
  } catch (err) {
    return false;
  }
}

// Gets a valid Twitch config, refreshing the token if needed.
async function getValidTwitchConfig() {
  let twitchConfig = fileUtils.readJSON(twitchConfigPath, {
    ACCESS_TOKEN: "",
    REFRESH_TOKEN: "",
    CLIENT_ID: "",
    VALID_UNTIL: "",
  });

  const now = Date.now();
  let validUntil = twitchConfig.VALID_UNTIL ? new Date(twitchConfig.VALID_UNTIL).getTime() : 0;

  let tokenValid = false;
  if (twitchConfig.ACCESS_TOKEN) {
    tokenValid = await validateToken(twitchConfig.ACCESS_TOKEN);
  }

  // If token is missing, expired, or invalid, refresh it.
  if (!twitchConfig.ACCESS_TOKEN || !twitchConfig.REFRESH_TOKEN || now >= validUntil || !tokenValid) {
    const response = await refreshToken(twitchConfig.REFRESH_TOKEN);
    if (response.success) {
      twitchConfig.ACCESS_TOKEN = response.token;
      twitchConfig.REFRESH_TOKEN = response.refresh;
      twitchConfig.CLIENT_ID = response.client_id;
      const ms59days = 59 * 24 * 60 * 60 * 1000;
      twitchConfig.VALID_UNTIL = new Date(now + ms59days).toISOString();
      fileUtils.writeJSON(twitchConfigPath, twitchConfig);
    } else {
      process.exit(1);
    }
  }
  return twitchConfig;
}

module.exports = {
  getValidTwitchConfig,
};