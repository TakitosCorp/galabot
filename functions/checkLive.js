const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

dotenv.config();

let nextLiveVideoId = null;

function loadNextLiveVideoId() {
  const filePath = path.join(__dirname, "../data/nextLiveVideo.json");
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    nextLiveVideoId = data.videoId;
    return data;
  }
  return null;
}

function saveNextLiveVideoId(videoDetails, logger) {
  const filePath = path.join(__dirname, "../data/nextLiveVideo.json");
  const data = {
    videoId: videoDetails.videoId,
    title: videoDetails.title,
    thumbnail: videoDetails.thumbnail,
    url: `https://www.youtube.com/watch?v=${videoDetails.videoId}`,
    timestamp: Date.now(),
    embedSent: false,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadEmbedStatus() {
  const filePath = path.join(__dirname, "../data/nextLiveVideo.json");
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return data.embedSent;
  } else {
    fs.writeFileSync(filePath, JSON.stringify({ embedSent: false }, null, 2));
    return false;
  }
}

function saveEmbedStatus(embedSent, logger) {
  const filePath = path.join(__dirname, "../data/nextLiveVideo.json");
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    data.embedSent = embedSent;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } else {
    const data = { embedSent };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    logger.info("Estado del embed guardado en nextLiveVideo.json");
  }
}

async function getLiveStreams(apiKey, channelId, logger) {
  const url = `https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=upcoming&type=video&key=${apiKey}`;
  const ongoingUrl = `https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;

  const upcomingResponse = await axios.get(url);
  const ongoingResponse = await axios.get(ongoingUrl);

  return {
    upcoming: upcomingResponse.data,
    ongoing: ongoingResponse.data,
  };
}

async function checkLiveStatus(apiKey, videoId, logger) {
  const url = `https://youtube.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${videoId}&key=${apiKey}`;
  const response = await axios.get(url);
  return response.data;
}

async function updateNextLiveVideo(logger) {
  try {
    const apiKey = process.env.GALAYAKI_YTAPIKEY;
    const channelId = process.env.GALAYAKI_YTCHANNELID;

    if (!apiKey || !channelId) {
      throw new Error("Faltan las variables de entorno GALAYAKI_YTAPIKEY o GALAYAKI_YTCHANNELID.");
    }

    const { upcoming, ongoing } = await getLiveStreams(apiKey, channelId, logger);

    const allStreams = [...upcoming.items, ...ongoing.items];

    if (allStreams.length > 0) {
      const detailedStreams = await Promise.all(
        allStreams.map(async (item) => {
          const videoId = item.id.videoId;
          const videoDetails = await checkLiveStatus(apiKey, videoId, logger);

          if (videoDetails.items && videoDetails.items.length > 0) {
            const liveDetails = videoDetails.items[0].liveStreamingDetails;
            const snippet = videoDetails.items[0].snippet;
            const scheduledTime = liveDetails?.scheduledStartTime
              ? new Date(liveDetails.scheduledStartTime).getTime()
              : null;
            const actualStartTime = liveDetails?.actualStartTime
              ? new Date(liveDetails.actualStartTime).getTime()
              : null;

            return {
              videoId,
              title: snippet.title,
              thumbnail: snippet.thumbnails.maxres?.url || snippet.thumbnails.high.url,
              scheduledTime,
              actualStartTime,
            };
          }
          return null;
        })
      );

      const now = Date.now();
      const sixHoursAgo = now - 6 * 60 * 60 * 1000;

      const validStreams = detailedStreams.filter(
        (item) => item && item.scheduledTime && item.scheduledTime > sixHoursAgo
      );

      const ongoingStreams = validStreams
        .filter((item) => item.actualStartTime && item.actualStartTime <= now)
        .sort((a, b) => (a.actualStartTime || Infinity) - (b.actualStartTime || Infinity));

      if (ongoingStreams.length > 0) {
        const nextStream = ongoingStreams[0];
        nextLiveVideoId = nextStream.videoId;
        saveNextLiveVideoId(nextStream, logger);
        return;
      }

      const upcomingStreams = validStreams
        .filter((item) => item.scheduledTime && item.scheduledTime > now)
        .sort((a, b) => (a.scheduledTime || Infinity) - (b.scheduledTime || Infinity));

      if (upcomingStreams.length > 0) {
        const nextStream = upcomingStreams[0];
        nextLiveVideoId = nextStream.videoId;
        saveNextLiveVideoId(nextStream, logger);
      } else {
        nextLiveVideoId = null;
      }
    } else {
      nextLiveVideoId = null;
    }
  } catch (err) {
    console.error(err);
    logger.warn("Error al obtener los directos:", err);
  }
}

async function isLive(logger, client) {
  try {
    const apiKey = process.env.GALAYAKI_YTAPIKEY;
    const discordChannelId = process.env.GALAYAKI_YTDISCORD;

    if (!apiKey || !nextLiveVideoId) {
      logger.warn("Faltan la clave de API o el ID del próximo directo.");
      return false;
    }

    const data = await checkLiveStatus(apiKey, nextLiveVideoId, logger);

    if (data.items && data.items.length > 0) {
      const liveDetails = data.items[0].liveStreamingDetails;

      if (liveDetails && liveDetails.concurrentViewers) {
        let embedSent = loadEmbedStatus();
        if (!embedSent) {
          const nextLiveData = loadNextLiveVideoId();
          const embed = {
            color: 0x800080,
            title: `🔴 ¡Gala está iniciando un nuevo directoooowo!`,
            description: `**${nextLiveData.title}**\n\n[Haz clic aquí pa venir a ver el directito y saludar a Galita!](https://www.youtube.com/watch?v=${nextLiveData.videoId})`,
            image: {
              url: nextLiveData.thumbnail,
            },
            footer: {
              text: "¡No te pierdas el directo eh, y si vienes asegúrate de dejar tu like y saludar ^.^!",
            },
          };
          const button = {
            type: 1,
            components: [
              {
                type: 2,
                label: "Ver directo",
                style: 5,
                url: `https://www.youtube.com/watch?v=${nextLiveData.videoId}`,
              },
            ],
          };
          try {
            const channel = await client.channels.fetch(discordChannelId);
            if (channel) {
              try {
                await channel.send({
                  content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
                  embeds: [embed],
                  components: [button],
                });
                logger.info("Embed enviado correctamente.");
                saveEmbedStatus(true, logger);
                embedSent = true;
              } catch (err) {
                logger.warn("Error al enviar el embed con el botón:", err);
                await channel.send({
                  content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
                  embeds: [embed],
                });
                logger.info("Embed enviado correctamente sin el botón.");
                saveEmbedStatus(true, logger);
                embedSent = true;
              }
            } else {
              logger.warn("No se pudo obtener el canal de Discord.");
            }
          } catch (err) {
            logger.warn("Error al obtener el canal de Discord:", err);
          }
        }
        return true;
      } else {
        logger.info("Gala no está en directo.");
        const embedSent = loadEmbedStatus();
        if (embedSent) {
          saveEmbedStatus(false, logger);
        }
        return false;
      }
    } else {
      logger.info("No se encontraron detalles del directo.");
      return false;
    }
  } catch (err) {
    logger.warn("Algo salió mal al comprobar el estado del directo:", err);
    return false;
  }
}

async function getLiveDetails(logger) {
  try {
    const apiKey = process.env.GALAYAKI_YTAPIKEY;

    if (!apiKey || !nextLiveVideoId) {
      return null;
    }

    const data = await checkLiveStatus(apiKey, nextLiveVideoId, logger);

    if (data.items && data.items.length > 0) {
      const liveDetails = data.items[0].liveStreamingDetails;
      return liveDetails;
    } else {
      return null;
    }
  } catch (err) {
    logger.warn("Algo salió mal al obtener los detalles del directo:", err);
    return null;
  }
}

async function saveLiveData(data, logger) {
  const filePath = path.join(__dirname, "../data/liveData.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  updateNextLiveVideo,
  isLive,
  getLiveDetails,
  saveLiveData,
  loadNextLiveVideoId,
  loadEmbedStatus,
  saveEmbedStatus,
};
