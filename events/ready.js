const { ActivityType } = require("discord.js");
const { CronJob } = require("cron");
const resources = require("../data/resources.json");
const { systemLogger } = require("../loggers/index");

module.exports = {
  name: "ready",
  async execute(discordClient) {
    systemLogger.info(`Bot ${discordClient.user.username} conectado`);

    const statusMessages = resources.statusMessages;

    function setRandomStatus() {
      const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
      discordClient.user.setActivity(randomStatus, { type: ActivityType.Custom });
    }

    async function updatePresence() {
      setRandomStatus();
    }

    await updatePresence();

    new CronJob(
      "* * * * *",
      async () => {
        await updatePresence(discordClient);
      },
      null,
      true
    );
  },
};
