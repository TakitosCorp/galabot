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
  async updateWorkflow(logger) {
    // We define the constants
    const nowDate = new Date();
    const upcomingStreamsFile = getFilePath("upcomingStreams.json");
    const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
    const upcomingStreamsArray = [];

    ensureFileExists(upcomingStreamsFile);
    ensureFileExists(nextUpcomingStreamFile);

    // First, we get all the upcoming streams.
    const upcomingStreams = await youtubeUtils.getUpcomingStreams();

    // Then we get the ongoing stream
    const ongoingStreamData = await youtubeUtils.getOngoingStream();
    let ongoingStream = null;

    if (ongoingStreamData.items.length > 0) {
      const videoId = ongoingStreamData.items[0].id.videoId;
      const stats = await youtubeUtils.getOngoingStats(videoId);
      if (stats.items.length > 0) {
        ongoingStream = {
          videoId: videoId,
          scheduledStart: new Date(stats.items[0].liveStreamingDetails.actualStartTime).toISOString(),
          title: stats.items[0].snippet.title,
          thumbnail: stats.items[0].snippet.thumbnails.maxres
            ? stats.items[0].snippet.thumbnails.maxres.url
            : stats.items[0].snippet.thumbnails.high.url,
          streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
        upcomingStreamsArray.push(ongoingStream);
      }
    }

    // Validate current stream before continuing
    const currentNextStream = require(nextUpcomingStreamFile);
    if (currentNextStream && currentNextStream.videoId) {
      const scheduledStart = new Date(currentNextStream.scheduledStart);
      // If stream is older than 12 hours, discard it
      if (nowDate - scheduledStart > 12 * 60 * 60 * 1000) {
        logger.info("Stored stream has expired, searching for new stream...");
        writeJSON(nextUpcomingStreamFile, {}); // Clear the file
      }
    }

    // Then, for each upcoming stream, we get the data that is important for us.
    for (const item of upcomingStreams.items) {
      const videoId = item.id.videoId;
      const stats = await youtubeUtils.getOngoingStats(videoId);
      if (stats.items.length === 0) continue;

      const scheduledStart = new Date(stats.items[0].liveStreamingDetails.scheduledStartTime);

      // Check if the scheduled start time is within the last 12 hours
      if (scheduledStart > nowDate || nowDate - scheduledStart <= 12 * 60 * 60 * 1000) {
        const title = stats.items[0].snippet.title;
        // Check if the title is not the title that it's used in the "Schedule stream". If it is, we don't add it to the array.
        if (!title.includes("【HORARIO SEMANAL】 Free chat! || GalaYaki")) {
          const thumbnail = stats.items[0].snippet.thumbnails.maxres
            ? stats.items[0].snippet.thumbnails.maxres.url
            : stats.items[0].snippet.thumbnails.high.url;

          const stream = {
            videoId,
            scheduledStart: stats.items[0].liveStreamingDetails.scheduledStartTime,
            title,
            thumbnail,
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
    let nextUpcomingStream = upcomingStreamsArray[0];

    // If there is an ongoing stream, set it as the next upcoming stream
    if (ongoingStream) {
      nextUpcomingStream = ongoingStream;
    }

    // Additional validation before saving the next stream
    if (nextUpcomingStream) {
      const streamStart = new Date(nextUpcomingStream.scheduledStart);
      // Only save if the stream hasn't passed more than 12 hours ago
      if (nowDate - streamStart <= 12 * 60 * 60 * 1000) {
        nextUpcomingStream.embedSent = false;
        writeJSON(nextUpcomingStreamFile, nextUpcomingStream);
        logger.info(`New stream saved: ${nextUpcomingStream.title}`);
      } else {
        logger.warn("Found stream has expired, will not be saved");
        writeJSON(nextUpcomingStreamFile, {});
      }
    } else {
      logger.warn("No ongoing or upcoming streams found.");
    }

    return upcomingStreamsArray;
  },

  //! Workflow 2: Every minute, we check if the stream that is loaded from the JSON file is live.
  //! If it is live, we send an embed message to the Discord channel.
  async checkFunction(logger) {
    // Validate that we have a video ID to check
    if (!nextUpcomingStream || !nextUpcomingStream.videoId) {
      logger.info("No stream data to check");
      return false;
    }

    // Get stream date
    const streamDate = new Date(nextUpcomingStream.scheduledStart);

    // If the stream is too old (more than 12 hours after its scheduled time)
    // we look for the next scheduled stream and update it
    if (now - streamDate > 12 * 60 * 60 * 1000) {
      logger.info(
        `Stream is too old to be valid. Scheduled stream: ${streamDate.toISOString()}, Now: ${now.toISOString()}`
      );

      // Load all upcoming streams
      const upcomingStreams = require(upcomingStreamsFile);

      if (Array.isArray(upcomingStreams) && upcomingStreams.length > 0) {
        // Sort and filter valid streams (future or recent)
        const validStreams = upcomingStreams
          .filter((stream) => {
            const streamTime = new Date(stream.scheduledStart);
            return streamTime > now - 12 * 60 * 60 * 1000;
          })
          .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

        // If there is a valid stream, update it
        if (validStreams.length > 0) {
          const newNextStream = validStreams[0];
          newNextStream.embedSent = false;
          writeJSON(nextUpcomingStreamFile, newNextStream);
          logger.info(`Expired stream replaced by: ${newNextStream.title}`);

          // Immediately verify the new stream
          return await checkStreamLive(newNextStream, logger);
        } else {
          logger.info("No valid future streams found to replace the expired one");
          writeJSON(nextUpcomingStreamFile, {});
          return false;
        }
      } else {
        logger.info("No list of upcoming streams available");
        return false;
      }
    }

    // If the stream is still valid, check if it's live
    return await checkStreamLive(nextUpcomingStream, logger);
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

// Helper function to check if a stream is live
async function checkStreamLive(stream, logger) {
  // Debug log
  logger.info(`Checking stream: ${stream.title} (ID: ${stream.videoId})`);
  logger.info(`Scheduled date: ${streamDate.toISOString()}, Current date: ${now.toISOString()}`);

  // Get the ongoing stats for the stream
  const ongoingStats = await youtubeUtils.getOngoingStats(stream.videoId);

  // Check if there are ongoing stats, if not, return false
  if (ongoingStats.items.length === 0) {
    logger.info("Stats are not available.");
    return false;
  }

  const liveDetails = ongoingStats.items[0].liveStreamingDetails;

  // Check if the stream is live
  if (liveDetails && liveDetails.concurrentViewers) {
    logger.info(`Stream is live with ${liveDetails.concurrentViewers} viewers`);
    return true;
  } else {
    if (liveDetails) {
      logger.info("Stream exists but is not live yet");
    } else {
      logger.info("No live streaming details available");
    }
    return false;
  }
}

module.exports = {
  youtubeUtils,
  workflows,
};
