const { ActivityType, Status } = require("discord.js");

module.exports = {
  name: "ready",
  execute(client, logger) {
    logger.info(`[✅] ${client.user.username} se ha conectado correctamente a Discord!`);

    const statusMessages = [
      "Vigilando a los takitos",
      "Esperando el stream de Galita",
      "Leyendo lo que escribes...",
      "Comiendo pulpo a la gallega",
      "Que haces leyendo esto?",
      "Protegiendo a los takitos",
      "Reclutando takitos",
      "Vigilando que se cumplan las reglas",
      "No menciones a Gala!",
      "Evadiendo impuestos",
    ];

    function setRandomStatus() {
      const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];

      client.user.setActivity(randomStatus, { type: ActivityType.Custom });
    }

    setInterval(setRandomStatus, 300000);

    client.user.setStatus("online");
    setRandomStatus();
  },
};
