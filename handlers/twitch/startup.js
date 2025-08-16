const twitchLog = require("../../utils/loggers").twitchLog;
const streamStartHandler = require("../../events/twitch/streamStart");
const streamEndHandler = require("../../events/twitch/streamEnd");
const messageHandler = require("../../events/twitch/messageCreate");
const interactionHandler = require("../../events/twitch/interactionCreate");
const { createEventData } = require("./eventData");

async function bootstrap(clientManager) {
  const { twitchChatClient, twitchApiClient, twitchEventSubListener } = clientManager;
  const channelName = process.env.TWITCH_CHANNEL;
  const username = process.env.TWITCH_USERNAME;

  twitchChatClient.onConnect(() => {
    twitchLog("info", `Cliente de chat de Twitch conectado como ${username}`);
  });

  twitchChatClient.onDisconnect((manually, reason) => {
    const reasonMsg = reason ? `${reason.message || "Sin mensaje"} (${reason.name})` : "Razón desconocida";
    twitchLog(
      "warn",
      `Cliente de Twitch desconectado: ${manually ? "Manualmente" : "Automáticamente"} - Razón: ${reasonMsg}`
    );
    if (!manually) {
      twitchLog("info", "El cliente intentará reconectar automáticamente...");
    }
  });

  twitchChatClient.onMessage(async (channel, user, message, msg) => {
    const eventData = createEventData(channel, user, message, msg);
    if (message.startsWith("!") || message.startsWith("g!")) {
      await interactionHandler(eventData, clientManager);
    } else {
      await messageHandler(eventData, clientManager);
    }
  });

  try {
    const user = await twitchApiClient.users.getUserByName(channelName.replace("#", ""));
    if (user) {
      twitchEventSubListener.onStreamOnline(user.id, (event) => {
        streamStartHandler(event, clientManager);
      });

      twitchEventSubListener.onStreamOffline(user.id, (event) => {
        twitchLog("info", `El stream de ${event.broadcasterDisplayName} ha terminado.`);
        streamEndHandler(event, clientManager);
      });

      twitchLog("info", `EventSub suscrito a los eventos de ${user.displayName}.`);
    } else {
      twitchLog("error", `No se pudo encontrar el usuario de Twitch: ${channelName}`);
    }
  } catch (error) {
    twitchLog("error", `Error configurando los listeners de EventSub: ${error.message}`);
  }

  twitchLog("info", "Bootstrap de Twitch completado.");
}

module.exports = { bootstrap };
