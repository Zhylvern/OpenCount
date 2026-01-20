const OVERLAY_ID = "opencount-overlay";
const CLOSE_KEY = "opencount-overlay-hidden";
const REFRESH_MS = 1000;

let overlayParts = null;
let refreshTimerId = null;

function formatTime(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function getDomain() {
  try {
    return new URL(window.location.href).hostname;
  } catch {
    return window.location.hostname || "";
  }
}

function isTopFrame() {
  return window.top === window;
}

function createOverlay() {
  const container = document.createElement("div");
  container.id = OVERLAY_ID;
  container.setAttribute("role", "status");
  container.style.cssText = [
    "position: fixed",
    "right: 12px",
    "bottom: 12px",
    "z-index: 2147483647",
    "background: #ffffff",
    "color: #0f172a",
    "border: 1px solid #e2e8f0",
    "border-radius: 14px",
    "padding: 8px 8px 6px",
    "font: 10px/1.2 'Avenir Next', 'Futura', 'Gill Sans', sans-serif",
    "box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12)",
    "width: 96px",
    "height: 96px",
    "display: flex",
    "flex-direction: column",
    "justify-content: center",
    "align-items: center",
    "gap: 2px",
    "position: fixed",
    "text-align: center",
    "box-sizing: border-box",
  ].join(";");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "x";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.style.cssText = [
    "position: absolute",
    "top: 4px",
    "right: 4px",
    "background: transparent",
    "border: none",
    "color: #64748b",
    "cursor: pointer",
    "font-size: 11px",
    "line-height: 1",
    "padding: 0 2px",
  ].join(";");

  closeButton.addEventListener("click", async () => {
    await browser.storage.local.set({ [CLOSE_KEY]: true });
    container.remove();
    if (refreshTimerId) {
      window.clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
    overlayParts = null;
  });

  const timeEl = document.createElement("div");
  timeEl.style.cssText = "font-weight:700;font-size:11px;";

  const visitsEl = document.createElement("div");
  visitsEl.style.cssText = "color:#475569;";

  container.appendChild(closeButton);
  container.appendChild(timeEl);
  container.appendChild(visitsEl);

  return { container, timeEl, visitsEl };
}

async function fetchStats() {
  const response = await browser.runtime.sendMessage({ type: "getLiveStats" });
  return response && response.stats ? response.stats : {};
}

async function updateOverlay(parts) {
  const domain = getDomain();
  if (!domain) return;

  try {
    const stats = await fetchStats();
    const data = stats[domain] || { visits: 0, activeTimeMs: 0 };
    parts.timeEl.textContent = `${formatTime(data.activeTimeMs)}`;
    parts.visitsEl.textContent = `${data.visits} visits`;
  } catch {
    parts.timeEl.textContent = "--";
    parts.visitsEl.textContent = "--";
  }
}

async function shouldHide() {
  const result = await browser.storage.local.get(CLOSE_KEY);
  return result[CLOSE_KEY] === true;
}

function isImmersiveMode() {
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      document.pointerLockElement
  );
}

async function syncOverlayVisibility() {
  if (!overlayParts) return;
  if (await shouldHide()) {
    overlayParts.container.style.display = "none";
    return;
  }
  overlayParts.container.style.display = isImmersiveMode() ? "none" : "flex";
}

async function start() {
  if (!isTopFrame()) return;
  if (document.getElementById(OVERLAY_ID)) {
    await syncOverlayVisibility();
    return;
  }
  if (await shouldHide()) return;

  overlayParts = createOverlay();
  document.documentElement.appendChild(overlayParts.container);
  updateOverlay(overlayParts);
  await syncOverlayVisibility();

  refreshTimerId = window.setInterval(
    () => updateOverlay(overlayParts),
    REFRESH_MS
  );
  window.addEventListener("beforeunload", () => {
    if (refreshTimerId) {
      window.clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
  });

  document.addEventListener("fullscreenchange", syncOverlayVisibility);
  document.addEventListener("webkitfullscreenchange", syncOverlayVisibility);
  document.addEventListener("mozfullscreenchange", syncOverlayVisibility);
  document.addEventListener("MSFullscreenChange", syncOverlayVisibility);
  document.addEventListener("pointerlockchange", syncOverlayVisibility);
}

start();

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "showOverlay") return;
  return (async () => {
    await browser.storage.local.set({ [CLOSE_KEY]: false });
    await start();
  })();
});
