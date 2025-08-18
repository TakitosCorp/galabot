const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const { twitchLog } = require("./loggers");

let browser;

async function getBrowser() {
  if (!browser) {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

    browser = await puppeteer.launch({
      headless: "new",
      executablePath,
      devtools: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--max-old-space-size=4096",
        "--enable-logging",
        "--v=1",
      ],
    });
  }
  return browser;
}

async function generateStreamBanner(streamData, options = {}) {
  let page;
  try {
    twitchLog("info", "Generando banner...");

    const templateName = options.templateName || "streamBanner.html";
    const templatePath = path.join(__dirname, "..", "templates", templateName);

    try {
      await fs.access(templatePath);
    } catch (error) {
      twitchLog("error", `Archivo HTML no encontrado: ${templatePath}`);
      throw new Error(`Template HTML no encontrado en: ${templatePath}`);
    }

    let htmlContent = await fs.readFile(templatePath, "utf8");
    if (!htmlContent || htmlContent.trim().length === 0) {
      twitchLog("error", "El archivo HTML está vacío");
      throw new Error("El archivo HTML está vacío");
    }

    if (templateName === "streamBanner.html") {
      const gameImageUrl =
        streamData.gameBoxArtUrl ||
        (streamData.gameId
          ? `https://static-cdn.jtvnw.net/ttv-boxart/${streamData.gameId}-432x576.jpg`
          : "https://static-cdn.jtvnw.net/ttv-static/404_boxart-432x576.jpg");

      let filteredTitle = (streamData.title || "Sin título")
        .replace(/!\w+\b/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      htmlContent = htmlContent
        .replace("{{STREAM_TITLE}}", filteredTitle)
        .replace("{{STREAM_CATEGORY}}", streamData.category || "Sin categoría")
        .replace("{{GAME_IMAGE_URL}}", gameImageUrl);
    }

    if (templateName === "nextStreams.html" && options.streamsJson) {
      htmlContent = htmlContent.replace(
        /const streams = \[[\s\S]*?\];/,
        `const streams = ${JSON.stringify(options.streamsJson, null, 2)};`
      );
    }

    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    page.on("pageerror", (error) => {
      twitchLog("error", `[Browser Error] ${error.message}`);
    });
    page.on("requestfailed", (request) => {
      twitchLog("warn", `[Request Failed] ${request.url()} - ${request.failure().errorText}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        twitchLog("warn", `[HTTP Error] ${response.url()} - ${response.status()}`);
      }
    });

    await page.setDefaultNavigationTimeout(45000);
    await page.setDefaultTimeout(45000);

    await page.setViewport({ width: 1280, height: 720 });

    const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    twitchLog("debug", "Navegando a data URI para renderizar el banner...");
    await page.goto(dataUri, {
      waitUntil: "networkidle0",
      timeout: 15000,
    });

    const bodyContent = await page.evaluate(() => document.body.innerHTML);
    if (!bodyContent || bodyContent.trim().length === 0) {
      twitchLog("warn", "El contenido del body está vacío tras el primer intento, reintentando con setContent...");
      await page.setContent(htmlContent, {
        waitUntil: ["load", "domcontentloaded"],
        timeout: 15000,
      });
      const bodyContentRetry = await page.evaluate(() => document.body.innerHTML);
      if (!bodyContentRetry || bodyContentRetry.trim().length === 0) {
        throw new Error("El contenido HTML no se cargó correctamente en la página");
      }
    }

    if (templateName === "nextStreams.html") {
      await page.waitForSelector("#streamsContainer", { timeout: 5000 }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 800));
    } else {
      try {
        await page.waitForSelector("#gameImage", { timeout: 5000 });
      } catch (error) {
        twitchLog("warn", `Imagen no cargada en tiempo esperado, continuando: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    twitchLog("debug", "Tomando screenshot del banner...");
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false,
      timeout: 5000,
    });

    await page.close();

    twitchLog("info", "Banner generado correctamente.");
    return screenshot;
  } catch (error) {
    if (page) {
      await page.close().catch(() => {});
    }
    twitchLog("error", `Error generando imagen del banner: ${error.message}`);
    twitchLog("error", `Stack trace: ${error.stack}`);
    throw error;
  }
}

async function generateNextStreamsImage(streamsJson) {
  return generateStreamBanner({}, { templateName: "nextStreams.html", streamsJson });
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = {
  generateStreamBanner,
  generateNextStreamsImage,
  closeBrowser,
};
