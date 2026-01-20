const STORAGE_KEY = "stats";

function formatTime(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

let rowMap = new Map();
let currentOrder = [];

function setNote(list, text) {
  list.innerHTML = "";
  const note = document.createElement("div");
  note.className = "note";
  note.textContent = text;
  list.appendChild(note);
}

async function render() {
  const list = document.getElementById("list");

  let stats = {};
  try {
    const response = await browser.runtime.sendMessage({ type: "getLiveStats" });
    if (response && response.stats) {
      stats = response.stats;
    } else {
      const result = await browser.storage.local.get(STORAGE_KEY);
      stats = result[STORAGE_KEY] || {};
    }
  } catch {
    setNote(list, "Storage unavailable. Try again.");
    return;
  }

  const entries = Object.entries(stats).sort(
    (a, b) => b[1].activeTimeMs - a[1].activeTimeMs
  );

  if (entries.length === 0) {
    setNote(list, "No data yet. Browse a few sites to start tracking.");
    rowMap = new Map();
    currentOrder = [];
    return;
  }

  const nextOrder = entries.map(([domain]) => domain);
  const orderChanged =
    nextOrder.length !== currentOrder.length ||
    nextOrder.some((domain, index) => domain !== currentOrder[index]);

  if (orderChanged) {
    list.innerHTML = "";
    rowMap = new Map();
    const fragment = document.createDocumentFragment();
    for (const [domain] of entries) {
      const row = document.createElement("div");
      row.className = "row";

      const domainEl = document.createElement("div");
      domainEl.className = "domain";
      domainEl.textContent = domain;

      const statsEl = document.createElement("div");
      statsEl.className = "stats";

      row.appendChild(domainEl);
      row.appendChild(statsEl);
      fragment.appendChild(row);
      rowMap.set(domain, statsEl);
    }
    list.appendChild(fragment);
    currentOrder = nextOrder;
  }

  for (const [domain, data] of entries) {
    const statsEl = rowMap.get(domain);
    if (!statsEl) continue;
    statsEl.textContent = `${data.visits} visits • ${formatTime(
      data.activeTimeMs
    )}`;
  }
}

render();

const REFRESH_MS = 1000;
let timerId = null;

function startAutoRefresh() {
  if (timerId) return;
  timerId = setInterval(render, REFRESH_MS);
}

function stopAutoRefresh() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

startAutoRefresh();

window.addEventListener("unload", stopAutoRefresh);

const showOverlayButton = document.getElementById("show-overlay");
if (showOverlayButton) {
  showOverlayButton.addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.id) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: "showOverlay" });
    } catch {
      // Ignore if the tab cannot receive messages (e.g. extension pages).
    }
  });
}
