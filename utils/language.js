function getLanguage(channelId) {
  return channelId === process.env.SPANISH_CHANNEL_ID ? "es" : "en";
}

module.exports = { getLanguage };
