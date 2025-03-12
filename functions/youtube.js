const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");
const { getFilePath, writeJSON, ensureFileExists } = require("../utils/fileUtils");

// Load the environment variables from the .env file.
dotenv.config();

// Load variables from the .env file.
const apiKey = process.env.GALAYAKI_YTAPIKEY;
const channelId = process.env.GALAYAKI_YTCHANNELID;

const youtubeUtils = {
  async getUpcomingStreams() {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=upcoming&type=video&key=${apiKey}`;
    const response = await axios.get(url);
    return response.data;
  },

  async getOngoingStream() {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
    const response = await axios.get(url);
    return response.data;
  },

  async getOngoingStats(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${videoId}&key=${apiKey}`;
    const response = await axios.get(url);
    return response.data;
  },
};

const workflows = {
  //! Workflow 1: Every 4 hours, we get all the upcoming streams and we save them in a JSON file.
  //! In the same workflow, we would save the next upcoming stream in a separate JSON file.
  async updateWorkflow() {
    // We define the constants
    const nowDate = new Date();
    const upcomingStreamsFile = getFilePath("upcomingStreams.json");
    const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
    const upcomingStreamsArray = [];

    ensureFileExists(upcomingStreamsFile);
    ensureFileExists(nextUpcomingStreamFile);

    // First, we get all the upcoming streams.
    const upcomingStreams = await youtubeUtils.getUpcomingStreams();

    // Then, for each upcoming stream, we get the data that is important for us.
    for (const item of upcomingStreams.items) {
      const videoId = item.id.videoId;
      const stats = await youtubeUtils.getOngoingStats(videoId);
      if (stats.items.length === 0) continue; // Verificar si hay datos

      const scheduledStart = new Date(stats.items[0].liveStreamingDetails.scheduledStartTime);

      // Check if the scheduled start time is within the last 12 hours
      if (scheduledStart > nowDate || nowDate - scheduledStart <= 12 * 60 * 60 * 1000) {
        const title = stats.items[0].snippet.title;
        // Check if the title is not the title that it's used in the "Schedule stream". If it is, we don't add it to the array.
        if (!title.includes("【HORARIO SEMANAL】 Free chat! || GalaYaki")) {
          const stream = {
            videoId,
            scheduledStart: stats.items[0].liveStreamingDetails.scheduledStartTime,
            title,
            thumbnail: stats.items[0].snippet.thumbnails.maxres.url,
            streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
          };
          upcomingStreamsArray.push(stream);
        }
      }
    }

    // We save the upcoming streams in the JSON file.
    writeJSON(upcomingStreamsFile, upcomingStreamsArray);

    // We now have to order the upcoming streams by date to get the next upcoming stream.
    upcomingStreamsArray.sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

    // We now save the upcoming stream to a variable.
    const nextUpcomingStream = upcomingStreamsArray[0];

    // Check if the current embedSent is true
    let currentNextStream = {};
    if (fs.existsSync(nextUpcomingStreamFile)) {
      currentNextStream = require(nextUpcomingStreamFile);
    }

    if (currentNextStream.embedSent) {
      const ongoingStream = await youtubeUtils.getOngoingStats(currentNextStream.videoId);
      if (ongoingStream.items.length === 0 || !ongoingStream.items[0].liveStreamingDetails.concurrentViewers) {
        nextUpcomingStream.embedSent = false;
      } else {
        nextUpcomingStream.embedSent = true;
      }
    } else {
      nextUpcomingStream.embedSent = false;
    }

    // Check if the next upcoming stream is the same as the current one
    if (currentNextStream.videoId !== nextUpcomingStream.videoId) {
      const ongoingStream = await youtubeUtils.getOngoingStats(currentNextStream.videoId);
      if (ongoingStream.items.length === 0 || !ongoingStream.items[0].liveStreamingDetails.concurrentViewers) {
        nextUpcomingStream.embedSent = false;
        writeJSON(nextUpcomingStreamFile, nextUpcomingStream);
      }
    } else if (!currentNextStream.embedSent) {
      nextUpcomingStream.embedSent = false;
      writeJSON(nextUpcomingStreamFile, nextUpcomingStream);
    }

    return upcomingStreamsArray;
  },

  //! Workflow 2: Every minute, we check if the stream that is loaded from the JSON file is live.
  //! If it is live, we send an embed message to the Discord channel.
  async checkFunction(client) {
    const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
    ensureFileExists(nextUpcomingStreamFile);
    const nextUpcomingStream = require(nextUpcomingStreamFile);

    // Get the ongoing streams
    const ongoingStreams = await youtubeUtils.getOngoingStream();

    // Check if there are ongoing streams, if not, return false
    if (ongoingStreams.items.length === 0) {
      return false;
    }

    // Check if the next upcoming stream is the same as the ongoing stream
    const liveStream = ongoingStreams.items[0];
    if (liveStream.id.videoId === nextUpcomingStream.videoId) {
      return true;
    } else {
      return false;
    }
  },

  //! Workflow 3: Send embed
  async sendEmbed(client, nextLiveData, logger) {
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
      const channel = await client.channels.fetch(process.env.GALAYAKI_YTDISCORD);
      if (channel) {
        try {
          await channel.send({
            content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
            embeds: [embed],
            components: [button],
          });
          logger.info("Embed enviado correctamente.");
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
  },
};

module.exports = {
  youtubeUtils,
  workflows,
};
