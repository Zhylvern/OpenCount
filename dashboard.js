const STORAGE_KEY = "stats";
const DAILY_KEY = "dailyStats";
const HOURLY_KEY = "hourlyStats";
const THEME_KEY = "dashboardTheme";

const COLORS = ["#0f766e", "#f97316", "#0ea5e9", "#16a34a", "#f43f5e"];

function formatTime(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${totalSeconds % 60}s`;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = document.getElementById("theme-toggle");
  if (button) {
    button.setAttribute("aria-pressed", theme === "dark");
  }
}

async function loadTheme() {
  const result = await browser.storage.local.get(THEME_KEY);
  const theme = result[THEME_KEY] || "light";
  setTheme(theme);
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadData() {
  const storage = await browser.storage.local.get([
    STORAGE_KEY,
    DAILY_KEY,
    HOURLY_KEY,
  ]);
  return {
    stats: storage[STORAGE_KEY] || {},
    dailyStats: storage[DAILY_KEY] || {},
    hourlyStats: storage[HOURLY_KEY] || {},
  };
}

function sumTotals(stats) {
  return Object.values(stats).reduce(
    (acc, item) => {
      acc.visits += item.visits || 0;
      acc.time += item.activeTimeMs || 0;
      return acc;
    },
    { visits: 0, time: 0 }
  );
}

function buildBars(target, entries, valueKey, valueLabel) {
  target.innerHTML = "";
  if (!entries.length) {
    target.textContent = "No data yet.";
    target.style.color = "#6b7280";
    return;
  }

  const max = Math.max(...entries.map(([, data]) => data[valueKey] || 0));
  entries.forEach(([domain, data], index) => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const name = document.createElement("strong");
    name.textContent = domain;

    const barWrap = document.createElement("div");
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.background = COLORS[index % COLORS.length];
    fill.style.width = `${max ? Math.round((data[valueKey] / max) * 100) : 0}%`;
    const tooltipLabel = `${domain}: ${valueLabel(data)}`;
    fill.dataset.tooltip = tooltipLabel;
    bar.dataset.tooltip = tooltipLabel;
    bar.appendChild(fill);

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = valueLabel(data);

    barWrap.appendChild(bar);
    barWrap.appendChild(label);

    row.appendChild(name);
    row.appendChild(barWrap);
    target.appendChild(row);
  });
}

function buildTable(target, entries) {
  target.innerHTML = "";
  if (!entries.length) {
    const row = document.createElement("tr");
    row.innerHTML = "<td colspan='3'>No data yet.</td>";
    target.appendChild(row);
    return;
  }

  entries.forEach(([domain, data]) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${domain}</td>
      <td>${data.visits}</td>
      <td>${formatTime(data.activeTimeMs)}</td>
    `;
    target.appendChild(row);
  });
}

function getLastDays(dailyStats, count = 7) {
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = getDateKey(date);
    const statsForDay = dailyStats[key] || {};
    const totalTime = Object.values(statsForDay).reduce(
      (sum, item) => sum + (item.activeTimeMs || 0),
      0
    );
    days.push({ key, totalTime });
  }
  return days;
}

function getDailyTotals(dailyStats, dateKey) {
  const statsForDay = dailyStats[dateKey] || {};
  return Object.values(statsForDay).reduce(
    (acc, item) => {
      acc.visits += item.visits || 0;
      acc.time += item.activeTimeMs || 0;
      return acc;
    },
    { visits: 0, time: 0 }
  );
}

function getMostActiveHour(hourlyStats) {
  const totals = new Array(24).fill(0);
  Object.values(hourlyStats).forEach((day) => {
    Object.entries(day).forEach(([hour, time]) => {
      const index = Number(hour);
      if (!Number.isNaN(index)) {
        totals[index] += time || 0;
      }
    });
  });
  let bestHour = null;
  let bestTime = 0;
  totals.forEach((time, hour) => {
    if (time > bestTime) {
      bestTime = time;
      bestHour = hour;
    }
  });
  return { hour: bestHour, time: bestTime };
}

function formatHour(hour) {
  if (hour === null) return "--";
  const label = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${label} ${suffix}`;
}

function drawTrend(canvas, days) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (canvas.clientWidth > 0) {
    canvas.width = canvas.clientWidth;
  }
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const accent =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#0f766e";
  const max = Math.max(...days.map((day) => day.totalTime), 1);
  const barWidth = Math.floor(width / days.length) - 8;

  days.forEach((day, index) => {
    const barHeight = Math.round((day.totalTime / max) * (height - 28));
    const x = index * (barWidth + 8) + 4;
    const y = height - barHeight - 16;

    ctx.fillStyle = accent;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#6b7280";
    ctx.font = "10px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(day.key.slice(5), x + barWidth / 2, height - 2);
  });
}

function parseColorToRgb(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    const normalized =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => char + char)
            .join("")
        : hex;
    const number = Number.parseInt(normalized, 16);
    return {
      r: (number >> 16) & 255,
      g: (number >> 8) & 255,
      b: number & 255,
    };
  }
  const match = trimmed.match(/\d+/g);
  if (!match || match.length < 3) {
    return { r: 15, g: 118, b: 110 };
  }
  return {
    r: Number(match[0]),
    g: Number(match[1]),
    b: Number(match[2]),
  };
}

function buildHeatmap(target, hourlyStats) {
  target.innerHTML = "";
  const order = [1, 2, 3, 4, 5, 6, 0];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const buckets = Array.from({ length: 7 }, () => new Array(24).fill(0));

  Object.entries(hourlyStats).forEach(([date, hours]) => {
    const [year, month, day] = date.split("-").map(Number);
    if (!year || !month || !day) return;
    const weekday = new Date(year, month - 1, day).getDay();
    Object.entries(hours || {}).forEach(([hour, time]) => {
      const hourIndex = Number(hour);
      if (Number.isNaN(hourIndex)) return;
      buckets[weekday][hourIndex] += time || 0;
    });
  });

  const max = Math.max(1, ...buckets.flat());
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  const { r, g, b } = parseColorToRgb(accent);

  target.appendChild(document.createElement("div"));
  for (let hour = 0; hour < 24; hour += 1) {
    const label = document.createElement("div");
    label.className = "heatmap-hour";
    label.textContent = hour % 3 === 0 ? String(hour).padStart(2, "0") : "";
    target.appendChild(label);
  }

  order.forEach((weekdayIndex, rowIndex) => {
    const rowLabel = document.createElement("div");
    rowLabel.className = "heatmap-label";
    rowLabel.textContent = labels[rowIndex];
    target.appendChild(rowLabel);

    for (let hour = 0; hour < 24; hour += 1) {
      const value = buckets[weekdayIndex][hour];
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      if (value > 0) {
        const intensity = Math.min(1, value / max);
        const alpha = 0.2 + intensity * 0.7;
        cell.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      const hourLabel = `${String(hour).padStart(2, "0")}:00`;
      cell.dataset.tooltip = `${labels[rowIndex]} ${hourLabel}: ${formatTime(
        value
      )}`;
      target.appendChild(cell);
    }
  });
}

function setupTooltip() {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  document.body.appendChild(tooltip);
  let canvasActive = false;

  function show(text, event) {
    tooltip.textContent = text;
    tooltip.style.left = `${event.pageX + 12}px`;
    tooltip.style.top = `${event.pageY - 18}px`;
    tooltip.classList.add("visible");
  }

  function hide() {
    tooltip.classList.remove("visible");
  }

  document.addEventListener("mousemove", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.tooltip) {
      show(target.dataset.tooltip, event);
      return;
    }
    if (!canvasActive) {
      hide();
    }
  });

  document.addEventListener("mouseleave", hide);

  return {
    show,
    hide,
    setCanvasActive: (value) => {
      canvasActive = value;
    },
  };
}

function downloadJson(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = getDateKey();
  link.href = url;
  link.download = `opencount-export-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv({ stats, dailyStats, hourlyStats }) {
  const rows = [];
  rows.push(["scope", "date", "hour", "domain", "visits", "activeTimeMs"]);

  Object.entries(stats).forEach(([domain, data]) => {
    rows.push([
      "all-time",
      "",
      "",
      domain,
      data.visits || 0,
      data.activeTimeMs || 0,
    ]);
  });

  Object.entries(dailyStats).forEach(([date, domains]) => {
    Object.entries(domains || {}).forEach(([domain, data]) => {
      rows.push([
        "daily",
        date,
        "",
        domain,
        data.visits || 0,
        data.activeTimeMs || 0,
      ]);
    });
  });

  Object.entries(hourlyStats).forEach(([date, hours]) => {
    Object.entries(hours || {}).forEach(([hour, time]) => {
      rows.push(["hourly", date, hour, "", "", time || 0]);
    });
  });

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = getDateKey();
  link.href = url;
  link.download = `opencount-export-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function render() {
  const { stats, dailyStats, hourlyStats } = await loadData();

  const entries = Object.entries(stats).sort(
    (a, b) => (b[1].activeTimeMs || 0) - (a[1].activeTimeMs || 0)
  );

  const totals = sumTotals(stats);
  document.getElementById("total-time").textContent = formatTime(totals.time);
  document.getElementById("total-visits").textContent = `${totals.visits} visits`;

  const todayKey = getDateKey();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = getDateKey(yesterdayDate);
  const todayTotals = getDailyTotals(dailyStats, todayKey);
  const yesterdayTotals = getDailyTotals(dailyStats, yesterdayKey);
  const deltaTime = todayTotals.time - yesterdayTotals.time;
  const deltaLabel = deltaTime >= 0 ? "more" : "less";
  document.getElementById("today-yesterday").textContent = `${formatTime(
    todayTotals.time
  )} today`;
  document.getElementById("today-yesterday-sub").textContent = `${
    Math.abs(deltaTime) ? formatTime(Math.abs(deltaTime)) : "0m 0s"
  } ${deltaLabel} than yesterday`;

  const avgSession =
    totals.visits > 0 ? Math.round(totals.time / totals.visits) : 0;
  document.getElementById("avg-session").textContent =
    totals.visits > 0 ? formatTime(avgSession) : "--";

  const activeHour = getMostActiveHour(hourlyStats);
  document.getElementById("active-hour").textContent = formatHour(
    activeHour.hour
  );
  document.getElementById("active-hour-sub").textContent =
    activeHour.hour === null
      ? "Collecting data..."
      : `${formatTime(activeHour.time)} total`;

  const topByTime = entries.slice(0, 6);
  const topByVisits = [...entries]
    .sort((a, b) => (b[1].visits || 0) - (a[1].visits || 0))
    .slice(0, 6);

  buildBars(
    document.getElementById("time-bars"),
    topByTime,
    "activeTimeMs",
    (data) => formatTime(data.activeTimeMs)
  );

  buildBars(
    document.getElementById("visit-bars"),
    topByVisits,
    "visits",
    (data) => `${data.visits} visits`
  );

  buildTable(document.getElementById("domain-table"), entries.slice(0, 12));

  const days = getLastDays(dailyStats, 7);
  drawTrend(document.getElementById("trend-chart"), days);

  buildHeatmap(document.getElementById("heatmap"), hourlyStats);

  const canvas = document.getElementById("trend-chart");
  canvas.dataset.days = JSON.stringify(days);
}

const tooltip = setupTooltip();

document.getElementById("trend-chart").addEventListener("mousemove", (event) => {
  const canvas = event.currentTarget;
  const days = JSON.parse(canvas.dataset.days || "[]");
  if (!days.length) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const barWidth = Math.floor(canvas.width / days.length) - 8;
  const index = Math.min(
    days.length - 1,
    Math.max(0, Math.floor(x / (barWidth + 8)))
  );
  const day = days[index];
  if (!day) return;
  const label = `${day.key}: ${formatTime(day.totalTime)}`;
  tooltip.setCanvasActive(true);
  tooltip.show(label, event);
});

document.getElementById("trend-chart").addEventListener("mouseleave", () => {
  tooltip.hide();
  tooltip.setCanvasActive(false);
});

const themeButton = document.getElementById("theme-toggle");
if (themeButton) {
  themeButton.addEventListener("click", async () => {
    const isDark = document.documentElement.dataset.theme === "dark";
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    await browser.storage.local.set({ [THEME_KEY]: nextTheme });
  });
}

const exportJsonButton = document.getElementById("export-json");
if (exportJsonButton) {
  exportJsonButton.addEventListener("click", async () => {
    const { stats, dailyStats, hourlyStats } = await loadData();
    downloadJson({
      exportedAt: new Date().toISOString(),
      stats,
      dailyStats,
      hourlyStats,
    });
  });
}

const exportCsvButton = document.getElementById("export-csv");
if (exportCsvButton) {
  exportCsvButton.addEventListener("click", async () => {
    const { stats, dailyStats, hourlyStats } = await loadData();
    downloadCsv({ stats, dailyStats, hourlyStats });
  });
}

const exportToggle = document.getElementById("export-toggle");
const exportPanel = document.querySelector(".export-panel");
if (exportToggle && exportPanel) {
  const closeMenu = () => {
    exportPanel.classList.remove("is-open");
    exportToggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    exportPanel.classList.add("is-open");
    exportToggle.setAttribute("aria-expanded", "true");
  };

  exportToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (exportPanel.classList.contains("is-open")) {
      closeMenu();
      return;
    }
    openMenu();
  });

  document.addEventListener("click", (event) => {
    if (!exportPanel.classList.contains("is-open")) return;
    if (exportPanel.contains(event.target) || exportToggle.contains(event.target)) {
      return;
    }
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  [exportJsonButton, exportCsvButton].forEach((button) => {
    if (!button) return;
    button.addEventListener("click", closeMenu);
  });
}

(async () => {
  await loadTheme();
  await render();
})();
