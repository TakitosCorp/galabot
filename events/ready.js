const { ActivityType } = require("discord.js");
const { CronJob } = require("cron");
const resources = require("../data/resources.json");
const { systemLogger } = require("../loggers/index");

module.exports = {
  name: "ready",
  async execute(client) {
    systemLogger.info(`Bot ${client.user.username} conectado`);

    const statusMessages = resources.statusMessages;

    function setRandomStatus() {
      const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
      client.user.setActivity(randomStatus, { type: ActivityType.Custom });
    }

    async function updatePresence() {
      setRandomStatus();
    }

    await updatePresence();

    new CronJob(
      "* * * * *",
      async () => {
        await updatePresence(client);
      },
      null,
      true
    );
  },
};
