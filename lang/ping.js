module.exports = {
  en: {
    banTitle: (username) => `Ban issued for ${username}`,
    banReason: "Accumulated 3 or more warnings for pinging Gala.",
    banAction: "Permanent server ban.",
    warnTitle: (username) => `Warning and Timeout for ${username}`,
    warnReason: "Warning for unnecessary ping to Gala.",
    warnCount: "Total warnings:",
    timeoutDuration: "Timeout duration:",
    timeoutMinutes: (mins) => `${mins} minutes`,
    dmFailWarn: "Could not send warning/timeout DM to user.",
    dmFailBan: "Could not send ban DM to user.",
  },
  es: {
    banTitle: (username) => `Baneo emitido para ${username}`,
    banReason: "Acumulación de 3 o más advertencias por mencionar a Gala.",
    banAction: "Baneo permanente del servidor.",
    warnTitle: (username) => `Advertencia y aislamiento para ${username}`,
    warnReason: "Advertencia por mención innecesaria a Gala.",
    warnCount: "Total de advertencias:",
    timeoutDuration: "Duración del aislamiento:",
    timeoutMinutes: (mins) => `${mins} minutos`,
    dmFailWarn:
      "No se pudo enviar el mensaje directo de advertencia al usuario.",
    dmFailBan: "No se pudo enviar el mensaje directo de baneo al usuario.",
  },
};
