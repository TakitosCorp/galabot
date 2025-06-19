const { ActivityType } = require("discord.js");
const { CronJob } = require("cron");
const { workflows } = require("../functions/youtube");
const { writeJSON, getFilePath, ensureFileExists } = require("../utils/fileUtils.js");
const resources = require("../data/resources.json");
const { 
  systemLogger, 
  streamLogger, 
  workflowUpdateLogger,
  workflowCheckLogger
} = require("../loggers/index");

let randomStatusInterval = null;
const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");

ensureFileExists(nextUpcomingStreamFile);

module.exports = {
  name: "ready",
  async execute(client) {
    systemLogger.info(`Bot ${client.user.username} conectado`);

    const statusMessages = resources.statusMessages;

    function setRandomStatus() {
      const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
      client.user.setActivity(randomStatus, { type: ActivityType.Custom });
    }

    async function updatePresence(client) {
      const liveStatus = await workflows.checkFunction();
      streamLogger.debug(`Estado en directo: ${liveStatus}`);
      if (liveStatus) {
        const nextLiveData = require("../data/nextUpcomingStream.json");
        if (nextLiveData) {
          client.user.setActivity({
            name: nextLiveData.title,
            type: ActivityType.Streaming,
            url: nextLiveData.streamUrl,
          });
          if (nextLiveData.embedSent === false) {
            await workflows.sendEmbed(client, nextLiveData);
            nextLiveData.embedSent = true;
            writeJSON(nextUpcomingStreamFile, nextLiveData);
          }
        } else {
          streamLogger.warn("No se pudieron cargar los datos del próximo directo.");
        }
        if (randomStatusInterval) {
          clearInterval(randomStatusInterval);
          randomStatusInterval = null;
        }
      } else {
        setRandomStatus();
        if (!randomStatusInterval) {
          randomStatusInterval = setInterval(setRandomStatus, 300000);
        }
      }
    }

    async function initialSetup() {
      systemLogger.warn("Actualizando datos al iniciar el bot.");
      await workflows.updateWorkflow();
      const nextLiveData = require("../data/nextUpcomingStream.json");
      if (nextLiveData) {
        nextLiveVideoId = nextLiveData.videoId;
      } else {
        systemLogger.warn("No se encontraron datos del próximo directo al iniciar. Creando datos iniciales.");
        await workflows.updateWorkflow();
      }
      await updatePresence(client);
    }

    async function scheduledTasks() {
      await workflows.updateWorkflow();
      await updatePresence(client);
    }

    await initialSetup();
    await scheduledTasks();

    new CronJob(
      "0 */3 * * *",
      async () => {
        workflowUpdateLogger.info("Ejecutando actualización programada de datos de streams");
        await scheduledTasks();
      },
      null,
      true
    );

    new CronJob(
      "* * * * *",
      async () => {
        workflowCheckLogger.info("Ejecutando verificación de streams en progreso");
        await updatePresence(client);
      },
      null,
      true
    );
  },
};
