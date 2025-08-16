const axios = require("axios");
const { getValidTwitchConfig } = require("./twitchToken");

async function getBroadcasterId(username, clientId, accessToken) {
  if (typeof username !== "string") {
    throw new Error(`El username debe ser un string. Valor recibido: ${JSON.stringify(username)}`);
  }
  const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`;
  try {
    const res = await axios.get(url, {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${accessToken}` },
    });
    const data = res.data;
    if (!data.data.length) throw new Error(`Usuario no encontrado: ${username}`);
    return data.data[0].id;
  } catch (err) {
    if (err.response) {
      const twitchError = err.response.data;
      throw new Error(`Error al obtener broadcasterId para "${username}": ${JSON.stringify(twitchError)}`);
    }
    throw err;
  }
}


async function getGameBoxArtUrlByCategoryName(twitchApiClient, categoryName) {
  if (!twitchApiClient || !categoryName) return null;
  try {
    const game = await twitchApiClient.games.getGameByName(categoryName);
    if (game) {
      return game.getBoxArtUrl(432, 576);
    }
    return null;
  } catch {
    return null;
  }
}

async function getStreamerScheduleThisWeek(username, twitchApiClient) {
  if (typeof username !== "string") {
    throw new Error(`El username debe ser un string. Valor recibido: ${JSON.stringify(username)}`);
  }
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

  const result = [];
  for (const seg of segments) {
    const category = seg.category?.name || "Sin categoría";
    let gameBoxArtUrl = null;
    if (category !== "Sin categoría" && twitchApiClient) {
      gameBoxArtUrl = await getGameBoxArtUrlByCategoryName(twitchApiClient, category);
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
