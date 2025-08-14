const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const { twitchLog } = require("./loggers");

let browser;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: "new",
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

async function generateStreamBanner(streamData) {
  let page;
  try {
    twitchLog("info", "Iniciando generación de banner...");

    const templatePath = path.join(__dirname, "..", "templates", "streamBanner.html");
    twitchLog("info", `Ruta del template: ${templatePath}`);

    try {
      await fs.access(templatePath);
      twitchLog("info", "Archivo HTML encontrado");
    } catch (error) {
      twitchLog("error", `Archivo HTML no encontrado: ${templatePath}`);
      throw new Error(`Template HTML no encontrado en: ${templatePath}`);
    }

    let htmlContent = await fs.readFile(templatePath, "utf8");
    twitchLog("info", `Contenido HTML leído, longitud: ${htmlContent.length} caracteres`);
    
    if (!htmlContent || htmlContent.trim().length === 0) {
      twitchLog("error", "El archivo HTML está vacío");
      throw new Error("El archivo HTML está vacío");
    }

    const gameImageUrl =
      streamData.gameBoxArtUrl ||
      (streamData.gameId
        ? `https://static-cdn.jtvnw.net/ttv-boxart/${streamData.gameId}-432x576.jpg`
        : "https://static-cdn.jtvnw.net/ttv-static/404_boxart-432x576.jpg");

    twitchLog("info", `Usando imagen del juego: ${gameImageUrl}`);

    htmlContent = htmlContent
      .replace("{{STREAM_TITLE}}", streamData.title || "Sin título")
      .replace("{{STREAM_CATEGORY}}", streamData.category || "Sin categoría")
      .replace("{{GAME_IMAGE_URL}}", gameImageUrl);

    twitchLog("info", `HTML procesado, longitud final: ${htmlContent.length} caracteres`);

    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    page.on("console", (msg) => {
      twitchLog("info", `[Browser Console] ${msg.type()}: ${msg.text()}`);
    });

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

    twitchLog("info", "Configurando viewport...");
    await page.setViewport({ width: 1280, height: 720 });

    twitchLog("info", "Cargando contenido HTML...");
    
    const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    twitchLog("info", `Data URI creado, longitud: ${dataUri.length} caracteres`);
    
    await page.goto(dataUri, {
      waitUntil: "networkidle0",
      timeout: 15000,
    });

    const bodyContent = await page.evaluate(() => document.body.innerHTML);
    twitchLog("info", `Contenido del body cargado, longitud: ${bodyContent.length} caracteres`);
    
    if (!bodyContent || bodyContent.trim().length === 0) {
      twitchLog("error", "El contenido del body está vacío después de cargar");
      
      twitchLog("info", "Intentando método alternativo con setContent...");
      await page.setContent(htmlContent, {
        waitUntil: ["load", "domcontentloaded"],
        timeout: 15000,
      });
      
      const bodyContentRetry = await page.evaluate(() => document.body.innerHTML);
      twitchLog("info", `Contenido del body (retry), longitud: ${bodyContentRetry.length} caracteres`);
      
      if (!bodyContentRetry || bodyContentRetry.trim().length === 0) {
        throw new Error("El contenido HTML no se cargó correctamente en la página");
      }
    }

    const pageTitle = await page.title();
    twitchLog("info", `Título de la página: ${pageTitle}`);

    twitchLog("info", "Verificando si la imagen del juego se cargó...");
    try {
      await page.waitForSelector("#gameImage", { timeout: 5000 });
      twitchLog("info", "Imagen del juego cargada correctamente");
    } catch (error) {
      twitchLog("warn", `Imagen no cargada en tiempo esperado, continuando: ${error.message}`);
    }

    twitchLog("info", "Esperando renderizado final...");
    await new Promise(resolve => setTimeout(resolve, 500));

    twitchLog("info", "Capturando screenshot...");
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false,
      timeout: 5000,
    });

    twitchLog("info", "Screenshot capturado exitosamente");
    await page.close();

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

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = {
  generateStreamBanner,
  closeBrowser,
};
