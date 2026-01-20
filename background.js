const STORAGE_KEY = "stats";
const DAILY_KEY = "dailyStats";
const STATE_KEY = "state";
const HOURLY_KEY = "hourlyStats";
const SESSION_KEY = "sessionStats";
const BOUNCE_THRESHOLD_MS = 30000;

let activeTabId = null;
let activeDomain = null;
let lastActiveTimestamp = null;
let windowFocused = true;
let sessionStartTimestamp = null;

function isTrackableUrl(url) {
  if (!url) return false;
  return !(url.startsWith("about:") || url.startsWith("moz-extension:"));
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function getStats() {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function getDailyStats() {
  const result = await browser.storage.local.get(DAILY_KEY);
  return result[DAILY_KEY] || {};
}

async function getHourlyStats() {
  const result = await browser.storage.local.get(HOURLY_KEY);
  return result[HOURLY_KEY] || {};
}

async function getSessionStats() {
  const result = await browser.storage.local.get(SESSION_KEY);
  return result[SESSION_KEY] || {};
}

async function saveStats(stats) {
  await browser.storage.local.set({ [STORAGE_KEY]: stats });
}

async function saveDailyStats(daily) {
  await browser.storage.local.set({ [DAILY_KEY]: daily });
}

async function saveHourlyStats(hourly) {
  await browser.storage.local.set({ [HOURLY_KEY]: hourly });
}

async function saveSessionStats(sessionStats) {
  await browser.storage.local.set({ [SESSION_KEY]: sessionStats });
}

async function ensureDomain(stats, domain) {
  if (!stats[domain]) {
    stats[domain] = { visits: 0, activeTimeMs: 0 };
  }
}

async function ensureSessionDomain(sessionStats, domain) {
  if (!sessionStats[domain]) {
    sessionStats[domain] = { sessions: 0, bounces: 0, totalSessionMs: 0 };
  }
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function ensureDailyDomain(dailyStats, dateKey, domain) {
  if (!dailyStats[dateKey]) {
    dailyStats[dateKey] = {};
  }
  if (!dailyStats[dateKey][domain]) {
    dailyStats[dateKey][domain] = { visits: 0, activeTimeMs: 0 };
  }
}

async function ensureHourlyBucket(hourlyStats, dateKey, hour) {
  if (!hourlyStats[dateKey]) {
    hourlyStats[dateKey] = {};
  }
  if (!hourlyStats[dateKey][hour]) {
    hourlyStats[dateKey][hour] = 0;
  }
}

async function recordHourlyTime(hourlyStats, startTs, endTs) {
  let current = startTs;
  while (current < endTs) {
    const currentDate = new Date(current);
    const dateKey = getDateKey(currentDate);
    const hour = currentDate.getHours();

    const nextHour = new Date(current);
    nextHour.setMinutes(60, 0, 0);
    const segmentEnd = Math.min(endTs, nextHour.getTime());
    const segment = segmentEnd - current;
    if (segment > 0) {
      await ensureHourlyBucket(hourlyStats, dateKey, hour);
      hourlyStats[dateKey][hour] += segment;
    }
    current = segmentEnd;
  }
}

async function saveState() {
  await browser.storage.local.set({
    [STATE_KEY]: {
      activeTabId,
      activeDomain,
      lastActiveTimestamp,
      windowFocused,
      sessionStartTimestamp,
    },
  });
}

async function loadState() {
  const result = await browser.storage.local.get(STATE_KEY);
  const state = result[STATE_KEY];
  if (!state) return;
  activeTabId = state.activeTabId;
  activeDomain = state.activeDomain;
  lastActiveTimestamp = state.lastActiveTimestamp;
  windowFocused = state.windowFocused;
  sessionStartTimestamp = state.sessionStartTimestamp || null;
}

async function recordActiveTime() {
  if (!windowFocused || !activeDomain || !lastActiveTimestamp) return;
  const now = Date.now();
  const elapsed = now - lastActiveTimestamp;
  if (elapsed <= 0) return;

  const stats = await getStats();
  const dailyStats = await getDailyStats();
  const hourlyStats = await getHourlyStats();
  await ensureDomain(stats, activeDomain);
  stats[activeDomain].activeTimeMs += elapsed;
  const dateKey = getDateKey();
  await ensureDailyDomain(dailyStats, dateKey, activeDomain);
  dailyStats[dateKey][activeDomain].activeTimeMs += elapsed;
  await recordHourlyTime(hourlyStats, lastActiveTimestamp, now);
  await saveStats(stats);
  await saveDailyStats(dailyStats);
  await saveHourlyStats(hourlyStats);

  lastActiveTimestamp = now;
  await saveState();
}

async function recordSession(endTimestamp = Date.now()) {
  if (!activeDomain || !sessionStartTimestamp) return;
  const duration = endTimestamp - sessionStartTimestamp;
  sessionStartTimestamp = null;
  if (duration <= 0) return;

  const sessionStats = await getSessionStats();
  await ensureSessionDomain(sessionStats, activeDomain);
  sessionStats[activeDomain].sessions += 1;
  sessionStats[activeDomain].totalSessionMs += duration;
  if (duration < BOUNCE_THRESHOLD_MS) {
    sessionStats[activeDomain].bounces += 1;
  }
  await saveSessionStats(sessionStats);
}

async function switchActiveDomain(newDomain) {
  await recordActiveTime();
  await recordSession();
  activeDomain = newDomain;
  lastActiveTimestamp = windowFocused && activeDomain ? Date.now() : null;
  sessionStartTimestamp = windowFocused && activeDomain ? Date.now() : null;
  await saveState();
}

async function countVisit(domain) {
  if (!domain) return;
  const stats = await getStats();
  const dailyStats = await getDailyStats();
  await ensureDomain(stats, domain);
  stats[domain].visits += 1;
  const dateKey = getDateKey();
  await ensureDailyDomain(dailyStats, dateKey, domain);
  dailyStats[dateKey][domain].visits += 1;
  await saveStats(stats);
  await saveDailyStats(dailyStats);
}

async function handleActiveTabChange(tabId) {
  const tab = await browser.tabs.get(tabId);
  if (!isTrackableUrl(tab.url)) {
    await switchActiveDomain(null);
    activeTabId = tabId;
    await saveState();
    return;
  }

  const domain = getDomainFromUrl(tab.url);
  await switchActiveDomain(domain);
  await countVisit(domain);
  activeTabId = tabId;
  await saveState();
}

browser.tabs.onActivated.addListener(async (activeInfo) => {
  await handleActiveTabChange(activeInfo.tabId);
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId) return;
  if (!changeInfo.url) return;
  if (!isTrackableUrl(changeInfo.url)) {
    await switchActiveDomain(null);
    return;
  }

  const newDomain = getDomainFromUrl(changeInfo.url);
  if (newDomain && newDomain !== activeDomain) {
    await switchActiveDomain(newDomain);
    await countVisit(newDomain);
  }
});

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    await recordActiveTime();
    await recordSession();
    windowFocused = false;
    lastActiveTimestamp = null;
    sessionStartTimestamp = null;
    await saveState();
    return;
  }

  windowFocused = true;
  lastActiveTimestamp = activeDomain ? Date.now() : null;
  sessionStartTimestamp = activeDomain ? Date.now() : null;
  await saveState();
});

browser.runtime.onStartup.addListener(async () => {
  await loadState();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && isTrackableUrl(tab.url)) {
    activeTabId = tab.id;
    activeDomain = getDomainFromUrl(tab.url);
    lastActiveTimestamp = windowFocused ? Date.now() : null;
    sessionStartTimestamp = windowFocused ? Date.now() : null;
    await saveState();
  }
});

browser.runtime.onInstalled.addListener(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && isTrackableUrl(tab.url)) {
    activeTabId = tab.id;
    activeDomain = getDomainFromUrl(tab.url);
    lastActiveTimestamp = windowFocused ? Date.now() : null;
    sessionStartTimestamp = windowFocused ? Date.now() : null;
    await saveState();
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (!message || !message.type) return;
  if (message.type === "getLiveStats") {
    return (async () => {
      const stats = await getStats();
      const liveStats = { ...stats };
      if (windowFocused && activeDomain && lastActiveTimestamp) {
        const elapsed = Date.now() - lastActiveTimestamp;
        if (elapsed > 0) {
          if (!liveStats[activeDomain]) {
            liveStats[activeDomain] = { visits: 0, activeTimeMs: 0 };
          }
          liveStats[activeDomain].activeTimeMs += elapsed;
        }
      }
      return { stats: liveStats };
    })();
  }
  if (message.type === "resetData") {
    return (async () => {
      await saveStats({});
      await saveDailyStats({});
      await saveHourlyStats({});
      await saveSessionStats({});
      lastActiveTimestamp = windowFocused && activeDomain ? Date.now() : null;
      sessionStartTimestamp = windowFocused && activeDomain ? Date.now() : null;
      await saveState();
      return { ok: true };
    })();
  }
});
