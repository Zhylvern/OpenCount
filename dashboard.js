const STORAGE_KEY = "stats";
const DAILY_KEY = "dailyStats";
const HOURLY_KEY = "hourlyStats";

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

  const max = Math.max(...days.map((day) => day.totalTime), 1);
  const barWidth = Math.floor(width / days.length) - 8;

  days.forEach((day, index) => {
    const barHeight = Math.round((day.totalTime / max) * (height - 28));
    const x = index * (barWidth + 8) + 4;
    const y = height - barHeight - 16;

    ctx.fillStyle = "#0f766e";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#6b7280";
    ctx.font = "10px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(day.key.slice(5), x + barWidth / 2, height - 2);
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

render();
