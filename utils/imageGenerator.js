const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const {
  PUPPETEER_PAGE_TIMEOUT_MS,
  PUPPETEER_GOTO_TIMEOUT_MS,
  PUPPETEER_SCREENSHOT_TIMEOUT_MS,
  PUPPETEER_SELECTOR_TIMEOUT_MS,
  NEXT_STREAMS_SETTLE_MS,
  BANNER_SETTLE_MS,
} = require("./constants");

let browser;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getBrowser() {
  if (browser) {
    try {
      await browser.version();
    } catch {
      browser = null;
    }
  }
  if (!browser) {
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
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
      ],
    });
  }
  return browser;
}

function getCommonTemplateVars(provider) {
  const isYt = provider === "youtube";
  return {
    "{{BG_CLASS}}": isYt
      ? "bg-gradient-to-br from-red-600 to-pink-500"
      : "bg-gradient-to-br from-purple-600 to-pink-500",
    "{{LINK_TEXT}}": isYt ? process.env.YOUTUBE_URL : process.env.TWITCH_URL,
  };
}

async function generateImageFromTemplate(
  templateName,
  replacements,
  waitSelector,
  settleMs,
) {
  let page;
  try {
    const templatePath = path.join(__dirname, "..", "templates", templateName);
    let htmlContent = await fs.readFile(templatePath, "utf8");

    for (const [key, value] of Object.entries(replacements)) {
      htmlContent = htmlContent.replace(new RegExp(key, "g"), value);
    }

    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    await page.setDefaultNavigationTimeout(PUPPETEER_PAGE_TIMEOUT_MS);
    await page.setDefaultTimeout(PUPPETEER_PAGE_TIMEOUT_MS);
    await page.setViewport({ width: 1280, height: 720 });

    const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    await page.goto(dataUri, {
      waitUntil: "networkidle0",
      timeout: PUPPETEER_GOTO_TIMEOUT_MS,
    });

    if (waitSelector) {
      await page
        .waitForSelector(waitSelector, {
          timeout: PUPPETEER_SELECTOR_TIMEOUT_MS,
        })
        .catch(() => {});
    }
    await new Promise((r) => setTimeout(r, settleMs));

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false,
      timeout: PUPPETEER_SCREENSHOT_TIMEOUT_MS,
    });
    await page.close();
    return screenshot;
  } catch (error) {
    if (page) await page.close().catch(() => {});
    throw error;
  }
}

async function generateStreamBanner(streamData) {
  const vars = getCommonTemplateVars(streamData.provider);
  let filteredTitle = (streamData.title || "No title")
    .replace(/!\w+\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  vars["{{STREAM_TITLE}}"] = escapeHtml(filteredTitle);
  vars["{{STREAM_CATEGORY}}"] = escapeHtml(
    streamData.category || "No category",
  );
  vars["{{GAME_IMAGE_URL}}"] = escapeHtml(streamData.image || "");

  return generateImageFromTemplate(
    "streamBanner.html",
    vars,
    "#gameImage",
    BANNER_SETTLE_MS,
  );
}

async function generateFollowupImage(streamData, streamsJson) {
  const vars = getCommonTemplateVars(streamData.provider);
  vars["{{STREAMS_JSON}}"] = JSON.stringify(streamsJson || []);

  return generateImageFromTemplate(
    "streamFollowup.html",
    vars,
    "#streamsContainer",
    NEXT_STREAMS_SETTLE_MS,
  );
}

async function generateEndedImage(streamData) {
  const vars = getCommonTemplateVars(streamData.provider);
  return generateImageFromTemplate(
    "streamEnded.html",
    vars,
    null,
    BANNER_SETTLE_MS,
  );
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = {
  generateStreamBanner,
  generateFollowupImage,
  generateEndedImage,
  closeBrowser,
};
