function createEventData(channel, user, message, msg) {
  return {
    channel: channel,
    user: {
      name: user,
      id: msg.userInfo.userId,
      displayName: msg.userInfo.displayName,
    },
    message: {
      content: message,
      id: msg.id,
      isCheer: msg.isCheer,
      bits: msg.bits || 0,
      emotes: msg.emotes,
    },
    flags: {
      mod: msg.userInfo.isMod,
      broadcaster: msg.userInfo.isBroadcaster,
      subscriber: msg.userInfo.isSubscriber,
      vip: msg.userInfo.isVip,
      founder: msg.userInfo.isFounder,
      staff: msg.userInfo.isStaff,
    },
    timestamp: new Date(),
    self: msg.userInfo.userName.toLowerCase() === process.env.TWITCH_USERNAME.toLowerCase(),
    rawData: msg,
  };
}

module.exports = { createEventData };
