/**
 * @module events/twitch/streamStart
 * @description
 * Reacts to a Twitch `streamOnline` EventSub by:
 *  1. Generating a custom banner image via Puppeteer.
 *  2. Posting an embed announcement (with optional role mention) into the
 *     configured Discord notification channel.
 *  3. Persisting the stream row (or updating its Discord message id if it
 *     already exists from a re-fired event).
 *  4. Starting the rolling viewer-average poller.
 */

"use strict";

const { twitchLog } = require("../../utils/loggers");
const {
  insertStream,
  streamExists,
  updateStreamDiscordMessage,
} = require("../../db/streams");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { generateStreamBanner } = require("../../utils/imageGenerator");
const { startViewersAverage } = require("../../utils/twitchViews");

/**
 * Process a `streamOnline` EventSub event. Failures at any step are logged but
 * the function never throws — the EventSub listener should keep running.
 *
 * @async
 * @param {import('@twurple/eventsub-base').EventSubStreamOnlineEvent} event
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<void>}
 */
async function streamStart(event, clientManager) {
  twitchLog("debug", "twitch:streamStart enter", {
    broadcaster: event.broadcasterDisplayName,
    broadcasterId: event.broadcasterId,
    streamId: event.id,
  });
  try {
    const { discordClient, twitchApiClient } = clientManager;

    if (!discordClient || !discordClient.isReady()) {
      twitchLog("warn", "twitch:streamStart discord-not-ready");
      return;
    }

    const stream = await event.getStream();
    if (!stream) {
      twitchLog("warn", "twitch:streamStart no-stream-data", {
        streamId: event.id,
      });
      return;
    }

    const resources = require("../../data/resources.json");
    const streamTitles = resources.en.streamTitles;
    const user = await event.getBroadcaster();

    let gameInfo = null;
    if (stream.gameId && twitchApiClient) {
      try {
        gameInfo = await twitchApiClient.games.getGameById(stream.gameId);
      } catch (error) {
        twitchLog("warn", "twitch:streamStart getGameById failed", {
          gameId: stream.gameId,
          err: error.message,
        });
      }
    }

    const twitchUrl =
      process.env.TWITCH_URL ||
      `https://www.twitch.tv/${event.broadcasterName}`;
    const randomTitle =
      streamTitles[Math.floor(Math.random() * streamTitles.length)];

    let attachment;
    try {
      const bannerData = {
        provider: "twitch",
        title: stream.title || "No title",
        category: stream.gameName || "No category",
        image: gameInfo
          ? gameInfo.getBoxArtUrl(432, 576)
          : stream.getThumbnailUrl(1280, 720) + `?t=${Date.now()}`,
      };

      twitchLog("debug", "twitch:streamStart generating banner", {
        category: bannerData.category,
      });
      const bannerBuffer = await generateStreamBanner(bannerData);
      attachment = new AttachmentBuilder(bannerBuffer, {
        name: "stream-banner.png",
      });
    } catch (error) {
      twitchLog("error", "twitch:streamStart banner-generation failed", {
        err: error.message,
        stack: error.stack,
      });
      attachment = null;
    }

    const embed = new EmbedBuilder()
      .setColor(0x800080)
      .setAuthor({
        name: randomTitle,
        iconURL: user.profilePictureUrl,
        url: twitchUrl,
      })
      .setURL(twitchUrl)
      .addFields(
        { name: "Title", value: stream.title || "No title", inline: false },
        {
          name: "Category",
          value: `*${stream.gameName || "No category"}*`,
          inline: false,
        },
        {
          name: "Tags",
          value:
            stream.tags && stream.tags.length > 0
              ? stream.tags.map((tag) => `\`${tag}\``).join(" ")
              : "None",
          inline: false,
        },
      )
      .setImage(
        attachment
          ? "attachment://stream-banner.png"
          : stream.getThumbnailUrl(1280, 720) + `?t=${Date.now()}`,
      )
      .setTimestamp(event.startDate)
      .setFooter({
        text: "Come say hi! ^^",
      });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Watch stream")
        .setStyle(ButtonStyle.Link)
        .setURL(twitchUrl),
    );

    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) {
      twitchLog("warn", "twitch:streamStart no-notification-channel");
      return;
    }

    const channel = await discordClient.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      const roleToMention = process.env.DISCORD_NOTIFICATION_ROLE_ID;
      const messageOptions = {
        content: roleToMention ? `<@&${roleToMention}>` : "",
        embeds: [embed],
        components: [button],
        ...(attachment ? { files: [attachment] } : {}),
      };

      const sentMessage = await channel.send(messageOptions);
      const discMsgId = sentMessage.id;
      twitchLog("info", "twitch:streamStart announcement posted", {
        streamId: event.id,
        channelId,
        discMsgId,
      });

      if (!(await streamExists(event.id))) {
        const streamData = {
          id: event.id,
          provider: "twitch",
          timestamp: event.startDate.toISOString(),
          title: stream.title || "No title",
          viewers: 0,
          category: stream.gameName || "No category",
          tags: JSON.stringify(stream.tags || []),
          discMsgId,
        };
        await insertStream(streamData);
        twitchLog("info", "twitch:streamStart row inserted", {
          streamId: event.id,
        });
      } else {
        await updateStreamDiscordMessage(event.id, discMsgId);
        twitchLog("info", "twitch:streamStart row updated (re-fire)", {
          streamId: event.id,
        });
      }

      if (twitchApiClient && process.env.TWITCH_CHANNEL) {
        startViewersAverage(
          event.id,
          twitchApiClient,
          process.env.TWITCH_CHANNEL,
        );
      }
    } else {
      twitchLog("warn", "twitch:streamStart channel-not-text", { channelId });
    }
  } catch (error) {
    twitchLog("error", "twitch:streamStart failed", {
      err: error.message,
      stack: error.stack,
    });
  }
}
module.exports = streamStart;
