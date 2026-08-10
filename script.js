// 就活情報はすべて1つのオブジェクトにまとめ、ブラウザの localStorage に保存する
const STORAGE_KEY = "jobSearchProfile";

const DEFAULT_GMAIL_QUERY =
  '(subject:(選考 OR 面接 OR エントリーシート OR ES OR インターン OR 内定 OR 説明会 OR 書類選考) OR from:(mynavi.jp OR rikunabi.com OR en-japan.com OR doda.jp OR indeed.com OR wantedly.com OR onecareer.jp)) newer_than:180d';

const defaultData = {
  profile: {
    name: "", furigana: "", email: "", phone: "", address: "",
    birthdate: "", school: "", faculty: "", graduation: "",
  },
  preferences: {
    industries: "", jobtypes: "", locations: "", workstyle: "",
    salaryMin: "", salaryMax: "", companySize: "", axis: "", notes: "",
  },
  history: [], // { id, type: 'edu'|'work', title, detail, start, end, note }
  skills: { skills: [], certifications: [], languages: [] },
  selfpr: { strengths: "", weaknesses: "", gakuchika: "", motivation: "", selfpr: "" },
  companies: [], // { id, name, industry, status, nextDate, note }
  events: [], // { id, title, type: 'deadline'|'interview'|'seminar'|'other', date, time, note }
  checklist: [
    { id: "def-1", label: "自己分析を行う", done: false },
    { id: "def-2", label: "業界・企業研究をする", done: false },
    { id: "def-3", label: "履歴書・ESを作成する", done: false },
    { id: "def-4", label: "OB/OG訪問をする", done: false },
    { id: "def-5", label: "SPI・Webテスト対策をする", done: false },
    { id: "def-6", label: "面接練習をする", done: false },
    { id: "def-7", label: "スーツ・身だしなみを準備する", done: false },
  ],
  gmailSettings: { clientId: "", query: DEFAULT_GMAIL_QUERY },
};

const boardColumns = ["検討中", "ES提出", "Webテスト", "一次面接", "二次面接", "最終面接", "内定", "内定辞退", "不採用"];

const statusClassMap = {
  "検討中": "status-neutral",
  "ES提出": "status-progress",
  "Webテスト": "status-progress",
  "一次面接": "status-progress",
  "二次面接": "status-progress",
  "最終面接": "status-progress",
  "内定": "status-success",
  "内定辞退": "status-neutral",
  "不採用": "status-danger",
};

const typeLabels = { deadline: "締切", interview: "面接", seminar: "説明会", other: "その他", company: "応募企業" };
const typeBadgeClass = {
  deadline: "badge-deadline",
  interview: "badge-interview",
  seminar: "badge-seminar",
  other: "badge-other",
  company: "badge-company",
};

let data = loadData();
let companyView = "list";
let calendarMonth = firstOfMonth(new Date());
let selectedDay = null;
let gmailAccessToken = null;
let gsiLoadPromise = null;

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultData);
  const parsed = JSON.parse(raw);
  // 将来フィールドが増えてもデフォルト値で補完する
  return {
    profile: { ...defaultData.profile, ...parsed.profile },
    preferences: { ...defaultData.preferences, ...parsed.preferences },
    history: parsed.history || [],
    skills: { ...defaultData.skills, ...parsed.skills },
    selfpr: { ...defaultData.selfpr, ...parsed.selfpr },
    companies: parsed.companies || [],
    events: parsed.events || [],
    checklist: parsed.checklist || defaultData.checklist,
    gmailSettings: { ...defaultData.gmailSettings, ...parsed.gmailSettings },
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML.replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function showSavedIndicator(name) {
  const el = document.querySelector(`[data-indicator="${name}"]`);
  if (!el) return;
  el.textContent = "保存しました";
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1500);
}

function showBanner(elId, message, level) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.className = `status-banner show ${level}`;
}

function dateObjToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr() {
  return dateObjToStr(new Date());
}

function dateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function firstOfMonth(d) {
  const copy = new Date(d);
  copy.setDate(1);
  return copy;
}

function formatMonth(str) {
  if (!str) return "現在";
  const [y, m] = str.split("-");
  return `${y}年${Number(m)}月`;
}

function formatDateJp(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const w = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${m}月${d}日(${w})`;
}

function getAllScheduleItems() {
  const items = [];
  data.events.forEach((e) => {
    items.push({ id: e.id, date: e.date, time: e.time, title: e.title, type: e.type, note: e.note, source: "event" });
  });
  data.companies.forEach((c) => {
    if (c.nextDate) {
      items.push({ id: c.id, date: c.nextDate, time: "", title: `${c.name}（${c.status}）`, type: "company", note: c.note, source: "company" });
    }
  });
  return items;
}

// ---------- タブ切り替え ----------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.tab;
    tabPanels.forEach((panel) => {
      panel.hidden = panel.id !== `tab-${target}`;
    });
  });
});

// ---------- 基本情報 ----------
const profileFields = {
  name: "p-name", furigana: "p-furigana", email: "p-email", phone: "p-phone",
  address: "p-address", birthdate: "p-birthdate", school: "p-school",
  faculty: "p-faculty", graduation: "p-graduation",
};

function loadProfileForm() {
  for (const [key, id] of Object.entries(profileFields)) {
    document.getElementById(id).value = data.profile[key] || "";
  }
}

document.querySelector('[data-save="profile"]').addEventListener("click", () => {
  for (const [key, id] of Object.entries(profileFields)) {
    data.profile[key] = document.getElementById(id).value.trim();
  }
  saveData();
  showSavedIndicator("profile");
});

// ---------- 希望条件 ----------
const preferenceFields = {
  industries: "pr-industries", jobtypes: "pr-jobtypes", locations: "pr-locations",
  workstyle: "pr-workstyle", salaryMin: "pr-salary-min", salaryMax: "pr-salary-max",
  companySize: "pr-company-size", axis: "pr-axis", notes: "pr-notes",
};

function loadPreferencesForm() {
  for (const [key, id] of Object.entries(preferenceFields)) {
    document.getElementById(id).value = data.preferences[key] || "";
  }
}

document.querySelector('[data-save="preferences"]').addEventListener("click", () => {
  for (const [key, id] of Object.entries(preferenceFields)) {
    data.preferences[key] = document.getElementById(id).value.trim();
  }
  saveData();
  showSavedIndicator("preferences");
});

// ---------- 経歴 ----------
const historyForm = document.getElementById("history-form");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");

function renderHistory() {
  historyList.innerHTML = "";
  const sorted = [...data.history].sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  historyEmpty.hidden = sorted.length > 0;

  sorted.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-badge ${entry.type === "edu" ? "badge-edu" : "badge-work"}">${entry.type === "edu" ? "学歴" : "職歴"}</span>
        <strong>${escapeHtml(entry.title)}</strong>
        ${entry.detail ? `<span class="entry-sub">${escapeHtml(entry.detail)}</span>` : ""}
        <span class="entry-period">${formatMonth(entry.start)} 〜 ${formatMonth(entry.end)}</span>
        ${entry.note ? `<p class="entry-note">${escapeHtml(entry.note)}</p>` : ""}
      </div>
      <button class="delete-btn" data-id="${entry.id}" title="削除">✕</button>
    `;
    historyList.appendChild(li);
  });
}

historyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  data.history.push({
    id: Date.now().toString(),
    type: document.getElementById("h-type").value,
    title: document.getElementById("h-title").value.trim(),
    detail: document.getElementById("h-detail").value.trim(),
    start: document.getElementById("h-start").value,
    end: document.getElementById("h-end").value,
    note: document.getElementById("h-note").value.trim(),
  });
  saveData();
  renderHistory();
  historyForm.reset();
});

historyList.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id || !e.target.classList.contains("delete-btn")) return;
  data.history = data.history.filter((h) => h.id !== id);
  saveData();
  renderHistory();
});

// ---------- スキル・資格・語学（タグ形式） ----------
const tagForms = document.querySelectorAll(".tag-form");

function renderTags(type) {
  const list = document.getElementById(`skills-${type}`);
  list.innerHTML = "";
  data.skills[type].forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "tag-chip";
    li.innerHTML = `<span>${escapeHtml(item)}</span><button class="tag-remove" data-type="${type}" data-index="${index}" title="削除">✕</button>`;
    list.appendChild(li);
  });
}

tagForms.forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const type = form.dataset.tagType;
    const input = form.querySelector("input");
    const value = input.value.trim();
    if (!value) return;
    data.skills[type].push(value);
    saveData();
    renderTags(type);
    form.reset();
    input.focus();
  });
});

document.querySelectorAll(".tag-list").forEach((list) => {
  list.addEventListener("click", (e) => {
    if (!e.target.classList.contains("tag-remove")) return;
    const { type, index } = e.target.dataset;
    data.skills[type].splice(Number(index), 1);
    saveData();
    renderTags(type);
  });
});

// ---------- 自己PR ----------
const selfprFields = {
  strengths: "sp-strengths", weaknesses: "sp-weaknesses", gakuchika: "sp-gakuchika",
  motivation: "sp-motivation", selfpr: "sp-selfpr",
};

function loadSelfprForm() {
  for (const [key, id] of Object.entries(selfprFields)) {
    document.getElementById(id).value = data.selfpr[key] || "";
  }
}

document.querySelector('[data-save="selfpr"]').addEventListener("click", () => {
  for (const [key, id] of Object.entries(selfprFields)) {
    data.selfpr[key] = document.getElementById(id).value.trim();
  }
  saveData();
  showSavedIndicator("selfpr");
});

// ---------- 応募企業管理 ----------
const companyForm = document.getElementById("company-form");
const companyList = document.getElementById("company-list");
const companyEmpty = document.getElementById("company-empty");
const companyStats = document.getElementById("company-stats");

function renderCompanyStats() {
  const total = data.companies.length;
  const inProgress = data.companies.filter((c) =>
    ["ES提出", "Webテスト", "一次面接", "二次面接", "最終面接"].includes(c.status)
  ).length;
  const offers = data.companies.filter((c) => c.status === "内定").length;

  companyStats.innerHTML = `
    <div class="stat">
      <span class="stat-num">${total}</span>
      <span class="stat-label">応募企業数</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${inProgress}</span>
      <span class="stat-label">選考中</span>
    </div>
    <div class="stat stat--success">
      <span class="stat-num">${offers}</span>
      <span class="stat-label">内定</span>
    </div>
  `;
}

function renderCompanyListView() {
  companyList.innerHTML = "";
  const sorted = [...data.companies].sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));
  companyEmpty.hidden = sorted.length > 0;

  sorted.forEach((c) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    const options = boardColumns.map((s) => `<option value="${s}" ${c.status === s ? "selected" : ""}>${s}</option>`).join("");
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-badge ${statusClassMap[c.status] || "status-neutral"}">${escapeHtml(c.status)}</span>
        <strong>${escapeHtml(c.name)}</strong>
        ${c.industry ? `<span class="entry-sub">${escapeHtml(c.industry)}</span>` : ""}
        ${c.nextDate ? `<span class="entry-period">次の予定: ${escapeHtml(c.nextDate)}</span>` : ""}
        <select class="quick-status" data-id="${c.id}">${options}</select>
        ${c.note ? `<p class="entry-note">${escapeHtml(c.note)}</p>` : ""}
      </div>
      <button class="delete-btn" data-id="${c.id}" title="削除">✕</button>
    `;
    companyList.appendChild(li);
  });
}

function renderCompanyBoard() {
  const board = document.getElementById("company-board");
  board.innerHTML = "";
  boardColumns.forEach((status) => {
    const col = document.createElement("div");
    col.className = "board-col";
    col.dataset.status = status;
    const items = data.companies.filter((c) => c.status === status);
    col.innerHTML = `<div class="board-col-header"><span>${escapeHtml(status)}</span><span class="board-count">${items.length}</span></div>`;

    items.forEach((c) => {
      const card = document.createElement("div");
      card.className = "board-card";
      card.draggable = true;
      card.dataset.id = c.id;
      card.innerHTML = `
        <strong>${escapeHtml(c.name)}</strong>
        ${c.industry ? `<span>${escapeHtml(c.industry)}</span>` : ""}
        ${c.nextDate ? `<span>次の予定: ${escapeHtml(c.nextDate)}</span>` : ""}
      `;
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
      });
      col.appendChild(card);
    });

    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const company = data.companies.find((c) => c.id === id);
      if (company) {
        company.status = status;
        saveData();
        renderCompanies();
        renderDashboard();
      }
    });

    board.appendChild(col);
  });
}

function renderCompanies() {
  renderCompanyStats();
  if (companyView === "list") {
    renderCompanyListView();
  } else {
    renderCompanyBoard();
  }
}

document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    companyView = btn.dataset.view;
    document.getElementById("company-list-view").hidden = companyView !== "list";
    document.getElementById("company-board-view").hidden = companyView !== "board";
    renderCompanies();
  });
});

companyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  data.companies.push({
    id: Date.now().toString(),
    name: document.getElementById("c-name").value.trim(),
    industry: document.getElementById("c-industry").value.trim(),
    status: document.getElementById("c-status").value,
    nextDate: document.getElementById("c-next-date").value,
    note: document.getElementById("c-note").value.trim(),
  });
  saveData();
  renderCompanies();
  renderDashboard();
  renderCalendar();
  renderAgenda();
  companyForm.reset();
});

companyList.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id || !e.target.classList.contains("delete-btn")) return;
  data.companies = data.companies.filter((c) => c.id !== id);
  saveData();
  renderCompanies();
  renderDashboard();
  renderCalendar();
  renderAgenda();
});

companyList.addEventListener("change", (e) => {
  if (!e.target.classList.contains("quick-status")) return;
  const id = e.target.dataset.id;
  const company = data.companies.find((c) => c.id === id);
  if (!company) return;
  company.status = e.target.value;
  saveData();
  renderCompanies();
  renderDashboard();
});

// ---------- カレンダー ----------
function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  document.getElementById("cal-title").textContent = `${year}年${month + 1}月`;

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";
  ["日", "月", "火", "水", "木", "金", "土"].forEach((w) => {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = w;
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const items = getAllScheduleItems();
  const today = todayStr();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement("div");
    el.className = "calendar-day empty";
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const str = dateStr(year, month, day);
    const dayItems = items.filter((it) => it.date === str);

    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (str === today) cell.classList.add("today");
    if (str === selectedDay) cell.classList.add("selected");
    cell.innerHTML = `<span class="calendar-day-num">${day}</span>`;

    if (dayItems.length > 0) {
      const dots = document.createElement("div");
      dots.className = "calendar-dots";
      dayItems.slice(0, 3).forEach((it) => {
        const dot = document.createElement("span");
        dot.className = `calendar-dot dot-${it.type}`;
        dot.title = it.title;
        dots.appendChild(dot);
      });
      if (dayItems.length > 3) {
        const more = document.createElement("span");
        more.className = "calendar-more";
        more.textContent = `+${dayItems.length - 3}`;
        dots.appendChild(more);
      }
      cell.appendChild(dots);
    }

    cell.addEventListener("click", () => {
      selectedDay = str;
      document.getElementById("ev-date").value = str;
      renderCalendar();
      renderCalendarDayDetail();
    });

    grid.appendChild(cell);
  }
}

function renderCalendarDayDetail() {
  const detail = document.getElementById("calendar-day-detail");
  if (!selectedDay) {
    detail.hidden = true;
    return;
  }
  detail.hidden = false;
  document.getElementById("calendar-day-title").textContent = `${formatDateJp(selectedDay)}の予定`;

  const list = document.getElementById("calendar-day-list");
  const empty = document.getElementById("calendar-day-empty");
  list.innerHTML = "";
  const dayItems = getAllScheduleItems().filter((it) => it.date === selectedDay);
  empty.hidden = dayItems.length > 0;

  dayItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-badge ${typeBadgeClass[item.type] || "badge-other"}">${typeLabels[item.type] || "予定"}</span>
        <strong>${escapeHtml(item.title)}</strong>
        ${item.time ? `<span class="entry-sub">${escapeHtml(item.time)}</span>` : ""}
        ${item.note ? `<p class="entry-note">${escapeHtml(item.note)}</p>` : ""}
      </div>
      ${item.source === "event" ? `<button class="delete-btn" data-id="${item.id}" title="削除">✕</button>` : ""}
    `;
    list.appendChild(li);
  });
}

document.getElementById("calendar-day-list").addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id || !e.target.classList.contains("delete-btn")) return;
  data.events = data.events.filter((ev) => ev.id !== id);
  saveData();
  renderCalendar();
  renderCalendarDayDetail();
  renderAgenda();
  renderDashboard();
});

document.getElementById("cal-prev").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

document.getElementById("event-form").addEventListener("submit", (e) => {
  e.preventDefault();
  data.events.push({
    id: Date.now().toString(),
    title: document.getElementById("ev-title").value.trim(),
    type: document.getElementById("ev-type").value,
    date: document.getElementById("ev-date").value,
    time: document.getElementById("ev-time").value,
    note: document.getElementById("ev-note").value.trim(),
  });
  saveData();
  renderCalendar();
  renderCalendarDayDetail();
  renderAgenda();
  renderDashboard();
  e.target.reset();
});

function renderAgenda() {
  const list = document.getElementById("agenda-list");
  const empty = document.getElementById("agenda-empty");
  list.innerHTML = "";
  const today = todayStr();
  const upcoming = getAllScheduleItems()
    .filter((it) => it.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  empty.hidden = upcoming.length > 0;

  upcoming.forEach((item) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-badge ${typeBadgeClass[item.type] || "badge-other"}">${typeLabels[item.type] || "予定"}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="entry-period">${formatDateJp(item.date)}</span>
        ${item.note ? `<p class="entry-note">${escapeHtml(item.note)}</p>` : ""}
      </div>
    `;
    list.appendChild(li);
  });
}

// ---------- ホーム（ダッシュボード） ----------
function renderDashboardStats() {
  const total = data.companies.length;
  const inProgress = data.companies.filter((c) =>
    ["ES提出", "Webテスト", "一次面接", "二次面接", "最終面接"].includes(c.status)
  ).length;
  const offers = data.companies.filter((c) => c.status === "内定").length;

  const today = todayStr();
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7Str = dateObjToStr(in7);
  const upcomingCount = getAllScheduleItems().filter((it) => it.date >= today && it.date <= in7Str).length;

  document.getElementById("home-stats").innerHTML = `
    <div class="stat stat--accent">
      <span class="stat-num">${upcomingCount}</span>
      <span class="stat-label">今週の予定</span>
    </div>
    <div class="stat">
      <span class="stat-num">${total}</span>
      <span class="stat-label">応募企業数</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${inProgress}</span>
      <span class="stat-label">選考中</span>
    </div>
    <div class="stat stat--success">
      <span class="stat-num">${offers}</span>
      <span class="stat-label">内定</span>
    </div>
  `;
}

function renderDashboard() {
  renderDashboardStats();

  const list = document.getElementById("home-upcoming");
  const empty = document.getElementById("home-upcoming-empty");
  list.innerHTML = "";
  const today = todayStr();
  const upcoming = getAllScheduleItems()
    .filter((it) => it.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  empty.hidden = upcoming.length > 0;

  upcoming.forEach((item) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-badge ${typeBadgeClass[item.type] || "badge-other"}">${typeLabels[item.type] || "予定"}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="entry-period">${formatDateJp(item.date)}</span>
      </div>
    `;
    list.appendChild(li);
  });
}

function renderChecklist() {
  const list = document.getElementById("checklist");
  list.innerHTML = "";
  data.checklist.forEach((item) => {
    const li = document.createElement("li");
    li.className = `checklist-item ${item.done ? "done" : ""}`;
    li.innerHTML = `
      <input type="checkbox" data-id="${item.id}" class="checklist-check" ${item.done ? "checked" : ""}>
      <span>${escapeHtml(item.label)}</span>
      <button class="delete-btn" data-id="${item.id}" title="削除">✕</button>
    `;
    list.appendChild(li);
  });
}

document.getElementById("checklist").addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id || !e.target.classList.contains("delete-btn")) return;
  data.checklist = data.checklist.filter((i) => i.id !== id);
  saveData();
  renderChecklist();
  renderDashboard();
});

document.getElementById("checklist").addEventListener("change", (e) => {
  if (!e.target.classList.contains("checklist-check")) return;
  const item = data.checklist.find((i) => i.id === e.target.dataset.id);
  if (!item) return;
  item.done = e.target.checked;
  saveData();
  renderChecklist();
  renderDashboard();
});

document.getElementById("checklist-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("checklist-input");
  const value = input.value.trim();
  if (!value) return;
  data.checklist.push({ id: Date.now().toString(), label: value, done: false });
  saveData();
  renderChecklist();
  renderDashboard();
  input.value = "";
});

// ---------- Gmail連携 ----------
function loadGmailSettingsForm() {
  document.getElementById("gm-client-id").value = data.gmailSettings.clientId || "";
  document.getElementById("gm-query").value = data.gmailSettings.query || DEFAULT_GMAIL_QUERY;
}

document.getElementById("gmail-save-settings").addEventListener("click", () => {
  data.gmailSettings.clientId = document.getElementById("gm-client-id").value.trim();
  data.gmailSettings.query = document.getElementById("gm-query").value.trim() || DEFAULT_GMAIL_QUERY;
  saveData();
  showSavedIndicator("gmail");
});

function loadGsi() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("スクリプトの読み込みに失敗しました"));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error("読み込みがタイムアウトしました")), 8000);
  });
  return gsiLoadPromise;
}

document.getElementById("gmail-connect").addEventListener("click", async () => {
  const clientId = data.gmailSettings.clientId;
  if (!clientId) {
    showBanner("gmail-status", "先に「設定を保存」でOAuthクライアントIDを保存してください。", "error");
    return;
  }
  showBanner("gmail-status", "Google認証の準備をしています…", "info");
  try {
    await loadGsi();
  } catch {
    showBanner(
      "gmail-status",
      "Google認証スクリプトを読み込めませんでした。プレビュー環境ではブロックされます。実際に公開したURLで開いて試してください。",
      "error"
    );
    return;
  }

  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    callback: (tokenResponse) => {
      if (!tokenResponse || tokenResponse.error) {
        showBanner("gmail-status", "認証に失敗しました。" + (tokenResponse && tokenResponse.error ? tokenResponse.error : ""), "error");
        return;
      }
      gmailAccessToken = tokenResponse.access_token;
      showBanner("gmail-status", "接続しました。メールを取得しています…", "info");
      fetchJobEmails();
    },
  });
  tokenClient.requestAccessToken();
});

document.getElementById("gmail-refresh").addEventListener("click", () => {
  if (!gmailAccessToken) {
    showBanner("gmail-status", "先に「Gmailと連携する」から接続してください。", "error");
    return;
  }
  fetchJobEmails();
});

document.getElementById("gmail-disconnect").addEventListener("click", () => {
  if (gmailAccessToken && window.google && window.google.accounts) {
    google.accounts.oauth2.revoke(gmailAccessToken, () => {});
  }
  gmailAccessToken = null;
  document.getElementById("gmail-list").innerHTML = "";
  document.getElementById("gmail-empty").hidden = false;
  showBanner("gmail-status", "切断しました。", "info");
});

async function fetchJobEmails() {
  const query = data.gmailSettings.query || DEFAULT_GMAIL_QUERY;
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
    );
    if (!listRes.ok) throw new Error(`メール一覧の取得に失敗しました (${listRes.status})`);
    const listData = await listRes.json();
    const ids = (listData.messages || []).map((m) => m.id);

    if (ids.length === 0) {
      renderGmailResults([]);
      showBanner("gmail-status", "条件に合うメールは見つかりませんでした。", "info");
      return;
    }

    const emails = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
        );
        if (!res.ok) return null;
        const msg = await res.json();
        const headers = Object.fromEntries(((msg.payload && msg.payload.headers) || []).map((h) => [h.name, h.value]));
        return {
          id: msg.id,
          subject: headers.Subject || "(件名なし)",
          from: headers.From || "",
          date: headers.Date || "",
          snippet: msg.snippet || "",
        };
      })
    );

    const validEmails = emails.filter(Boolean);
    renderGmailResults(validEmails);
    showBanner("gmail-status", `${validEmails.length}件のメールを取得しました。`, "success");
  } catch (err) {
    showBanner("gmail-status", "メールの取得に失敗しました。" + err.message, "error");
  }
}

function extractSenderName(from) {
  const match = from.match(/^"?([^"<]*)"?\s*<?/);
  return match && match[1].trim() ? match[1].trim() : from;
}

function renderGmailResults(emails) {
  const list = document.getElementById("gmail-list");
  const empty = document.getElementById("gmail-empty");
  list.innerHTML = "";
  empty.hidden = emails.length > 0;

  emails.forEach((mail) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-main">
        <strong>${escapeHtml(mail.subject)}</strong>
        <span class="entry-sub">${escapeHtml(mail.from)}</span>
        <span class="entry-period">${escapeHtml(mail.date)}</span>
        ${mail.snippet ? `<p class="entry-note">${escapeHtml(mail.snippet)}</p>` : ""}
        <div class="email-actions">
          <button type="button" class="email-action-btn" data-action="event" data-subject="${escapeHtml(mail.subject)}">予定に追加</button>
          <button type="button" class="email-action-btn" data-action="company" data-from="${escapeHtml(extractSenderName(mail.from))}">企業として追加</button>
        </div>
      </div>
    `;
    list.appendChild(li);
  });
}

document.getElementById("gmail-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".email-action-btn");
  if (!btn) return;
  if (btn.dataset.action === "event") {
    document.querySelector('.tab-btn[data-tab="calendar"]').click();
    document.getElementById("ev-title").value = btn.dataset.subject;
    document.getElementById("ev-date").value = todayStr();
    document.getElementById("ev-title").focus();
  } else if (btn.dataset.action === "company") {
    document.querySelector('.tab-btn[data-tab="companies"]').click();
    document.getElementById("c-name").value = btn.dataset.from;
    document.getElementById("c-name").focus();
  }
});

// ---------- サマリー出力 ----------
const summaryOutput = document.getElementById("summary-output");

function buildSummary() {
  const p = data.profile;
  const pr = data.preferences;
  const sp = data.selfpr;
  const lines = [];

  lines.push("■ 基本情報");
  lines.push(`氏名: ${p.name || "-"}（${p.furigana || "-"}）`);
  lines.push(`連絡先: ${p.email || "-"} / ${p.phone || "-"}`);
  lines.push(`住所: ${p.address || "-"}`);
  lines.push(`学校: ${p.school || "-"} ${p.faculty || ""}`.trim());
  lines.push(`卒業予定: ${p.graduation || "-"}`);
  lines.push("");

  lines.push("■ 希望条件");
  lines.push(`業界: ${pr.industries || "-"}`);
  lines.push(`職種: ${pr.jobtypes || "-"}`);
  lines.push(`勤務地: ${pr.locations || "-"}`);
  lines.push(`働き方: ${pr.workstyle || "-"}`);
  lines.push(`希望年収: ${pr.salaryMin || "-"}万円 〜 ${pr.salaryMax || "-"}万円`);
  lines.push(`企業規模: ${pr.companySize || "-"}`);
  lines.push(`企業選びの軸: ${pr.axis || "-"}`);
  lines.push("");

  lines.push("■ 経歴");
  if (data.history.length === 0) {
    lines.push("（未登録）");
  } else {
    [...data.history]
      .sort((a, b) => (b.start || "").localeCompare(a.start || ""))
      .forEach((h) => {
        lines.push(`・[${h.type === "edu" ? "学歴" : "職歴"}] ${h.title} ${h.detail ? "(" + h.detail + ")" : ""} ${formatMonth(h.start)}〜${formatMonth(h.end)}`);
        if (h.note) lines.push(`  ${h.note}`);
      });
  }
  lines.push("");

  lines.push("■ スキル・資格・語学");
  lines.push(`スキル: ${data.skills.skills.join("、") || "-"}`);
  lines.push(`資格: ${data.skills.certifications.join("、") || "-"}`);
  lines.push(`語学: ${data.skills.languages.join("、") || "-"}`);
  lines.push("");

  lines.push("■ 自己PR等");
  lines.push(`強み: ${sp.strengths || "-"}`);
  lines.push(`弱み: ${sp.weaknesses || "-"}`);
  lines.push(`ガクチカ: ${sp.gakuchika || "-"}`);
  lines.push(`志望動機: ${sp.motivation || "-"}`);
  lines.push(`自己PR文: ${sp.selfpr || "-"}`);
  lines.push("");

  lines.push("■ 応募企業");
  if (data.companies.length === 0) {
    lines.push("（未登録）");
  } else {
    data.companies.forEach((c) => {
      lines.push(`・${c.name}（${c.industry || "-"}）- ${c.status}${c.nextDate ? " / 次の予定: " + c.nextDate : ""}`);
    });
  }
  lines.push("");

  lines.push("■ 今後の予定");
  const today = todayStr();
  const upcoming = getAllScheduleItems()
    .filter((it) => it.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length === 0) {
    lines.push("（未登録）");
  } else {
    upcoming.forEach((it) => {
      lines.push(`・${formatDateJp(it.date)} [${typeLabels[it.type] || "予定"}] ${it.title}`);
    });
  }

  return lines.join("\n");
}

document.getElementById("generate-summary").addEventListener("click", () => {
  summaryOutput.value = buildSummary();
});

document.getElementById("copy-summary").addEventListener("click", async () => {
  if (!summaryOutput.value) {
    summaryOutput.value = buildSummary();
  }
  try {
    await navigator.clipboard.writeText(summaryOutput.value);
    showSavedIndicator("summary");
  } catch {
    summaryOutput.select();
  }
});

// ---------- データのバックアップ ----------
document.getElementById("export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `job-search-data-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showBanner("backup-status", "エクスポートしました。", "success");
});

document.getElementById("import-data").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      data = {
        profile: { ...defaultData.profile, ...imported.profile },
        preferences: { ...defaultData.preferences, ...imported.preferences },
        history: imported.history || [],
        skills: { ...defaultData.skills, ...imported.skills },
        selfpr: { ...defaultData.selfpr, ...imported.selfpr },
        companies: imported.companies || [],
        events: imported.events || [],
        checklist: imported.checklist || defaultData.checklist,
        gmailSettings: { ...defaultData.gmailSettings, ...imported.gmailSettings },
      };
      saveData();
      renderAll();
      showBanner("backup-status", "インポートしました。", "success");
    } catch {
      showBanner("backup-status", "JSONファイルの読み込みに失敗しました。ファイル形式を確認してください。", "error");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
});

// ---------- 初期描画 ----------
function renderAll() {
  loadProfileForm();
  loadPreferencesForm();
  loadSelfprForm();
  renderHistory();
  renderTags("skills");
  renderTags("certifications");
  renderTags("languages");
  renderCompanies();
  renderCalendar();
  renderCalendarDayDetail();
  renderAgenda();
  renderChecklist();
  renderDashboard();
  loadGmailSettingsForm();
}

renderAll();
