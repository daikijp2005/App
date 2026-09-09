// 就活の進捗を企業ごとに管理し、ブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const STORAGE_KEY = "job-hunt-entries";
const EVENTS_STORAGE_KEY = "job-hunt-events";

const STAGES = [
  { id: "considering", label: "検討中", color: "gray" },
  { id: "entered", label: "エントリー済み", color: "blue" },
  { id: "screening", label: "書類選考", color: "purple" },
  { id: "interview", label: "面接", color: "warning" },
  { id: "offer", label: "内定", color: "success" },
  { id: "closed", label: "見送り・辞退", color: "muted" },
];

// 説明会・インターン・締切などの「予定」の種類
const EVENT_TYPES = [
  { id: "explanation", label: "説明会", color: "blue" },
  { id: "internship", label: "インターン", color: "purple" },
  { id: "interview", label: "面接", color: "warning" },
  { id: "deadline", label: "締切", color: "danger" },
  { id: "other", label: "その他", color: "gray" },
];

let entries = loadEntries();
let events = loadEvents();
let currentView = "board";
let currentSearch = "";
let editingId = null;
let editingEventId = null;
let importDrafts = [];
let idCounter = 0;

const calendarMonth = new Date();
calendarMonth.setDate(1);

function uid(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

const statsBox = document.getElementById("stats");
const upcomingList = document.getElementById("upcoming-list");
const upcomingEmpty = document.getElementById("upcoming-empty");
const boardView = document.getElementById("board-view");
const listView = document.getElementById("list-view");
const listViewList = document.getElementById("list-view-list");
const listEmpty = document.getElementById("list-empty");
const calendarView = document.getElementById("calendar-view");
const calendarGrid = document.getElementById("calendar-grid");
const calMonthLabel = document.getElementById("cal-month-label");
const calPrevBtn = document.getElementById("cal-prev");
const calNextBtn = document.getElementById("cal-next");
const calTodayBtn = document.getElementById("cal-today");
const searchInput = document.getElementById("search-input");
const viewButtons = document.querySelectorAll(".view-btn");

const addBtn = document.getElementById("add-btn");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalClose = document.getElementById("modal-close");
const cancelBtn = document.getElementById("cancel-btn");
const deleteBtn = document.getElementById("delete-btn");
const entryForm = document.getElementById("entry-form");

const entryIdInput = document.getElementById("entry-id");
const companyInput = document.getElementById("company");
const positionInput = document.getElementById("position");
const statusSelect = document.getElementById("status");
const nextDateInput = document.getElementById("next-date");
const nextActionInput = document.getElementById("next-action");
const urlInput = document.getElementById("url");
const memoInput = document.getElementById("memo");

const addEventBtn = document.getElementById("add-event-btn");
const eventModalOverlay = document.getElementById("event-modal-overlay");
const eventModalTitle = document.getElementById("event-modal-title");
const eventModalClose = document.getElementById("event-modal-close");
const eventCancelBtn = document.getElementById("event-cancel-btn");
const eventDeleteBtn = document.getElementById("event-delete-btn");
const eventForm = document.getElementById("event-form");

const eventIdInput = document.getElementById("event-id");
const eventDateInput = document.getElementById("event-date");
const eventTimeInput = document.getElementById("event-time");
const eventTypeSelect = document.getElementById("event-type");
const eventTitleInput = document.getElementById("event-title");
const eventCompanyInput = document.getElementById("event-company");
const eventMemoInput = document.getElementById("event-memo");

const importBtn = document.getElementById("import-btn");
const importModalOverlay = document.getElementById("import-modal-overlay");
const importModalClose = document.getElementById("import-modal-close");
const importCancelBtn = document.getElementById("import-cancel-btn");
const importTextarea = document.getElementById("import-textarea");
const importParseBtn = document.getElementById("import-parse-btn");
const importPreview = document.getElementById("import-preview");
const importEmpty = document.getElementById("import-empty");
const importConfirmBtn = document.getElementById("import-confirm-btn");

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadEvents() {
  const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEvents() {
  localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
}

function getStage(stageId) {
  return STAGES.find((s) => s.id === stageId) || STAGES[0];
}

function getEventType(typeId) {
  return EVENT_TYPES.find((t) => t.id === typeId) || EVENT_TYPES[EVENT_TYPES.length - 1];
}

function formatDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 今日からの残り日数を計算し、緊急度クラスを決める
function getUrgency(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { level: "urgent", label: "期限切れ", diffDays };
  if (diffDays === 0) return { level: "urgent", label: "今日", diffDays };
  if (diffDays === 1) return { level: "urgent", label: "明日", diffDays };
  if (diffDays <= 3) return { level: "soon", label: `あと${diffDays}日`, diffDays };
  return { level: "safe", label: `あと${diffDays}日`, diffDays };
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function matchesSearch(entry) {
  if (!currentSearch) return true;
  const q = currentSearch.toLowerCase();
  return (
    entry.company.toLowerCase().includes(q) ||
    (entry.position || "").toLowerCase().includes(q)
  );
}

function renderStats() {
  const active = entries.filter((e) => e.status !== "offer" && e.status !== "closed");
  const offers = entries.filter((e) => e.status === "offer");

  const soonUrgencies = [
    ...entries.filter((e) => e.status !== "closed").map((e) => getUrgency(e.nextDate)),
    ...events.map((ev) => getUrgency(ev.date)),
  ];
  const soonCount = soonUrgencies.filter((u) => u && (u.level === "urgent" || u.level === "soon")).length;

  statsBox.innerHTML = `
    <div class="stat">
      <span class="stat-num">${entries.length}</span>
      <span class="stat-label">登録企業数</span>
    </div>
    <div class="stat stat--info">
      <span class="stat-num">${active.length}</span>
      <span class="stat-label">選考中</span>
    </div>
    <div class="stat stat--success">
      <span class="stat-num">${offers.length}</span>
      <span class="stat-label">内定</span>
    </div>
    <div class="stat stat--danger">
      <span class="stat-num">${soonCount}</span>
      <span class="stat-label">直近の予定</span>
    </div>
  `;
}

function renderUpcoming() {
  const items = [];

  entries
    .filter((e) => e.nextDate && e.status !== "closed")
    .forEach((e) => {
      items.push({
        date: e.nextDate,
        urgency: getUrgency(e.nextDate),
        company: e.company,
        label: e.nextAction || getStage(e.status).label,
        onClick: () => openModal(e.id),
      });
    });

  events.forEach((ev) => {
    items.push({
      date: ev.date,
      urgency: getUrgency(ev.date),
      company: ev.company || "",
      label: ev.title,
      onClick: () => openEventModal(ev.id),
    });
  });

  items.sort((a, b) => a.urgency.diffDays - b.urgency.diffDays);
  const top = items.slice(0, 6);

  upcomingList.innerHTML = "";
  upcomingEmpty.hidden = top.length > 0;

  top.forEach((item) => {
    const li = document.createElement("li");
    li.className = `upcoming-item urgency-${item.urgency.level}`;
    li.innerHTML = `
      <span class="upcoming-badge">${item.urgency.label}</span>
      ${item.company ? `<span class="upcoming-company">${escapeHtml(item.company)}</span>` : ""}
      <span class="upcoming-action">${escapeHtml(item.label)}</span>
      <span class="upcoming-date">${item.date}</span>
    `;
    li.addEventListener("click", item.onClick);
    upcomingList.appendChild(li);
  });
}

function createCard(entry) {
  const urgency = getUrgency(entry.nextDate);
  const card = document.createElement("div");
  card.className = "card";
  card.draggable = true;
  card.dataset.id = entry.id;

  card.innerHTML = `
    <div class="card-top">
      <strong class="card-company">${escapeHtml(entry.company)}</strong>
    </div>
    ${entry.position ? `<div class="card-position">${escapeHtml(entry.position)}</div>` : ""}
    <div class="card-meta">
      ${
        entry.nextDate
          ? `<span class="card-date urgency-${urgency.level}">${urgency.label} ・ ${entry.nextDate}</span>`
          : `<span class="card-date card-date--none">予定なし</span>`
      }
    </div>
    ${entry.nextAction ? `<div class="card-action">次: ${escapeHtml(entry.nextAction)}</div>` : ""}
  `;

  card.addEventListener("click", () => openModal(entry.id));

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", entry.id);
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
  });

  return card;
}

function renderBoard() {
  boardView.innerHTML = "";

  const visible = entries.filter(matchesSearch);

  STAGES.forEach((stage) => {
    const column = document.createElement("div");
    column.className = "board-column";
    column.dataset.status = stage.id;

    const stageEntries = visible
      .filter((e) => e.status === stage.id)
      .sort((a, b) => {
        const au = getUrgency(a.nextDate);
        const bu = getUrgency(b.nextDate);
        if (au && bu) return au.diffDays - bu.diffDays;
        if (au) return -1;
        if (bu) return 1;
        return 0;
      });

    column.innerHTML = `
      <div class="column-header column-header--${stage.color}">
        <span>${stage.label}</span>
        <span class="column-count">${stageEntries.length}</span>
      </div>
      <div class="column-body" data-status="${stage.id}"></div>
    `;

    const body = column.querySelector(".column-body");
    stageEntries.forEach((entry) => body.appendChild(createCard(entry)));

    body.addEventListener("dragover", (e) => {
      e.preventDefault();
      body.classList.add("drag-over");
    });
    body.addEventListener("dragleave", () => {
      body.classList.remove("drag-over");
    });
    body.addEventListener("drop", (e) => {
      e.preventDefault();
      body.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const entry = entries.find((en) => en.id === id);
      if (entry && entry.status !== stage.id) {
        entry.status = stage.id;
        saveEntries();
        render();
      }
    });

    boardView.appendChild(column);
  });
}

function renderList() {
  const visible = entries
    .filter(matchesSearch)
    .sort((a, b) => {
      const au = getUrgency(a.nextDate);
      const bu = getUrgency(b.nextDate);
      if (au && bu) return au.diffDays - bu.diffDays;
      if (au) return -1;
      if (bu) return 1;
      return 0;
    });

  listViewList.innerHTML = "";
  listEmpty.hidden = visible.length > 0;

  visible.forEach((entry) => {
    const stage = getStage(entry.status);
    const urgency = getUrgency(entry.nextDate);
    const li = document.createElement("li");
    li.className = "entry-row";
    li.innerHTML = `
      <span class="entry-stage entry-stage--${stage.color}">${stage.label}</span>
      <div class="entry-main">
        <strong>${escapeHtml(entry.company)}</strong>
        ${entry.position ? `<span class="entry-position">${escapeHtml(entry.position)}</span>` : ""}
      </div>
      <span class="entry-date ${urgency ? "urgency-" + urgency.level : ""}">
        ${entry.nextDate ? `${urgency.label} ・ ${entry.nextDate}` : "予定なし"}
      </span>
    `;
    li.addEventListener("click", () => openModal(entry.id));
    listViewList.appendChild(li);
  });
}

function render() {
  renderStats();
  renderUpcoming();
  renderBoard();
  renderList();
  renderCalendar();
}

function populateStatusSelect() {
  statusSelect.innerHTML = STAGES.map((s) => `<option value="${s.id}">${s.label}</option>`).join("");
}

function populateEventTypeSelect() {
  eventTypeSelect.innerHTML = EVENT_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  calMonthLabel.textContent = `${year}年${month + 1}月`;

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayStr = formatDateInput(new Date());

  const dayItems = {};
  const addItem = (dateStr, item) => {
    if (!dayItems[dateStr]) dayItems[dateStr] = [];
    dayItems[dateStr].push(item);
  };

  entries
    .filter((e) => e.nextDate && e.status !== "closed")
    .forEach((e) => {
      addItem(e.nextDate, {
        label: e.nextAction || getStage(e.status).label,
        company: e.company,
        color: "blue",
        onClick: () => openModal(e.id),
      });
    });

  events.forEach((ev) => {
    addItem(ev.date, {
      label: ev.title,
      company: ev.company,
      color: getEventType(ev.type).color,
      onClick: () => openEventModal(ev.id),
    });
  });

  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  calendarGrid.innerHTML = "";

  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - firstWeekday;
    let cellDate;
    let otherMonth = false;

    if (dayOffset < 0) {
      cellDate = new Date(year, month - 1, daysInPrevMonth + dayOffset + 1);
      otherMonth = true;
    } else if (dayOffset >= daysInMonth) {
      cellDate = new Date(year, month + 1, dayOffset - daysInMonth + 1);
      otherMonth = true;
    } else {
      cellDate = new Date(year, month, dayOffset + 1);
    }

    const dateStr = formatDateInput(cellDate);
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    if (otherMonth) cell.classList.add("other-month");
    if (dateStr === todayStr) cell.classList.add("is-today");

    const dayNum = document.createElement("div");
    dayNum.className = "calendar-day-num";
    dayNum.textContent = cellDate.getDate();
    cell.appendChild(dayNum);

    const items = dayItems[dateStr] || [];
    items.slice(0, 3).forEach((item) => {
      const chip = document.createElement("div");
      chip.className = `event-chip event-chip--${item.color}`;
      chip.textContent = item.company ? `${item.company} ${item.label}` : item.label;
      chip.title = chip.textContent;
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        item.onClick();
      });
      cell.appendChild(chip);
    });

    if (items.length > 3) {
      const more = document.createElement("div");
      more.className = "event-chip-more";
      more.textContent = `+${items.length - 3}件`;
      cell.appendChild(more);
    }

    cell.addEventListener("click", () => openEventModal(null, dateStr));
    calendarGrid.appendChild(cell);
  }
}

function openModal(id) {
  editingId = id || null;
  entryForm.reset();

  if (editingId) {
    const entry = entries.find((e) => e.id === editingId);
    modalTitle.textContent = "企業情報を編集";
    deleteBtn.hidden = false;
    entryIdInput.value = entry.id;
    companyInput.value = entry.company;
    positionInput.value = entry.position || "";
    statusSelect.value = entry.status;
    nextDateInput.value = entry.nextDate || "";
    nextActionInput.value = entry.nextAction || "";
    urlInput.value = entry.url || "";
    memoInput.value = entry.memo || "";
  } else {
    modalTitle.textContent = "企業を追加";
    deleteBtn.hidden = true;
    entryIdInput.value = "";
    statusSelect.value = STAGES[0].id;
  }

  modalOverlay.hidden = false;
  companyInput.focus();
}

function closeModal() {
  modalOverlay.hidden = true;
  editingId = null;
}

addBtn.addEventListener("click", () => openModal(null));
modalClose.addEventListener("click", closeModal);
cancelBtn.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!modalOverlay.hidden) closeModal();
  if (!eventModalOverlay.hidden) closeEventModal();
  if (!importModalOverlay.hidden) closeImportModal();
});

entryForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const data = {
    company: companyInput.value.trim(),
    position: positionInput.value.trim(),
    status: statusSelect.value,
    nextDate: nextDateInput.value,
    nextAction: nextActionInput.value.trim(),
    url: urlInput.value.trim(),
    memo: memoInput.value.trim(),
  };

  if (editingId) {
    const entry = entries.find((en) => en.id === editingId);
    Object.assign(entry, data);
  } else {
    entries.push({ id: Date.now().toString(), ...data });
  }

  saveEntries();
  render();
  closeModal();
});

deleteBtn.addEventListener("click", () => {
  if (!editingId) return;
  entries = entries.filter((e) => e.id !== editingId);
  saveEntries();
  render();
  closeModal();
});

searchInput.addEventListener("input", (e) => {
  currentSearch = e.target.value.trim();
  renderBoard();
  renderList();
});

viewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    viewButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    boardView.hidden = currentView !== "board";
    listView.hidden = currentView !== "list";
    calendarView.hidden = currentView !== "calendar";
  });
});

calPrevBtn.addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});

calNextBtn.addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

calTodayBtn.addEventListener("click", () => {
  const today = new Date();
  calendarMonth.setFullYear(today.getFullYear(), today.getMonth(), 1);
  renderCalendar();
});

// --- 予定（説明会・インターン・締切など）の追加・編集・削除 ---

function openEventModal(id, prefillDate) {
  editingEventId = id || null;
  eventForm.reset();

  if (editingEventId) {
    const ev = events.find((e) => e.id === editingEventId);
    eventModalTitle.textContent = "予定を編集";
    eventDeleteBtn.hidden = false;
    eventIdInput.value = ev.id;
    eventDateInput.value = ev.date;
    eventTimeInput.value = ev.time || "";
    eventTypeSelect.value = ev.type;
    eventTitleInput.value = ev.title;
    eventCompanyInput.value = ev.company || "";
    eventMemoInput.value = ev.memo || "";
  } else {
    eventModalTitle.textContent = "予定を追加";
    eventDeleteBtn.hidden = true;
    eventIdInput.value = "";
    eventTypeSelect.value = EVENT_TYPES[0].id;
    if (prefillDate) eventDateInput.value = prefillDate;
  }

  eventModalOverlay.hidden = false;
  eventTitleInput.focus();
}

function closeEventModal() {
  eventModalOverlay.hidden = true;
  editingEventId = null;
}

addEventBtn.addEventListener("click", () => openEventModal(null));
eventModalClose.addEventListener("click", closeEventModal);
eventCancelBtn.addEventListener("click", closeEventModal);
eventModalOverlay.addEventListener("click", (e) => {
  if (e.target === eventModalOverlay) closeEventModal();
});

eventForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const data = {
    date: eventDateInput.value,
    time: eventTimeInput.value,
    type: eventTypeSelect.value,
    title: eventTitleInput.value.trim(),
    company: eventCompanyInput.value.trim(),
    memo: eventMemoInput.value.trim(),
  };

  if (editingEventId) {
    const ev = events.find((e2) => e2.id === editingEventId);
    Object.assign(ev, data);
  } else {
    events.push({ id: uid("evt"), ...data });
  }

  saveEvents();
  render();
  closeEventModal();
});

eventDeleteBtn.addEventListener("click", () => {
  if (!editingEventId) return;
  events = events.filter((e) => e.id !== editingEventId);
  saveEvents();
  render();
  closeEventModal();
});

// --- 就活サイトのテキストを貼り付けて予定をインポート ---

const EVENT_KEYWORDS = [
  { keywords: ["インターン"], type: "internship" },
  { keywords: ["説明会", "セミナー"], type: "explanation" },
  { keywords: ["面接"], type: "interview" },
  { keywords: ["締切", "締め切り", "提出", "エントリー"], type: "deadline" },
];

const DATE_RE = /(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})日?/;
const TIME_RE = /(\d{1,2}):(\d{2})/;
const WEEKDAY_RE = /[（(][月火水木金土日][）)]/;
const COMPANY_RE = /[\p{L}\p{N}Ａ-Ｚａ-ｚ]*(?:株式会社|合同会社|有限会社|㈱)[\p{L}\p{N}Ａ-Ｚａ-ｚ]*/u;

function guessEventType(text) {
  for (const { keywords, type } of EVENT_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) return type;
  }
  return "other";
}

function guessCompany(text) {
  const match = text.match(COMPANY_RE);
  return match ? match[0] : "";
}

function parseScheduleText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const drafts = [];

  lines.forEach((line) => {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) return;

    const month = parseInt(dateMatch[2], 10);
    const day = parseInt(dateMatch[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return;

    const year = dateMatch[1] ? parseInt(dateMatch[1], 10) : today.getFullYear();
    let dateObj = new Date(year, month - 1, day);
    if (isNaN(dateObj.getTime())) return;

    // 年が書かれていない場合、すでに過ぎた日付なら来年の予定とみなす
    if (!dateMatch[1] && dateObj < today) {
      dateObj = new Date(year + 1, month - 1, day);
    }

    const timeMatch = line.match(TIME_RE);

    let rest = line
      .replace(dateMatch[0], "")
      .replace(WEEKDAY_RE, "")
      .replace(TIME_RE, "")
      .replace(/[〜~～]/g, " ")
      .trim();

    const company = guessCompany(rest);
    if (company) rest = rest.replace(company, "").trim();
    rest = rest.replace(/\s{2,}/g, " ").trim();

    drafts.push({
      draftId: uid("draft"),
      date: formatDateInput(dateObj),
      time: timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "",
      type: guessEventType(line),
      title: rest || "予定",
      company,
      source: line,
    });
  });

  return drafts;
}

function closeImportModal() {
  importModalOverlay.hidden = true;
}

function renderImportPreview() {
  importPreview.innerHTML = "";
  importEmpty.hidden = importDrafts.length > 0 || importTextarea.value.trim() === "";
  importConfirmBtn.hidden = importDrafts.length === 0;

  importDrafts.forEach((draft) => {
    const row = document.createElement("div");
    row.className = "import-row";

    const top = document.createElement("div");
    top.className = "import-row-top";

    const source = document.createElement("span");
    source.className = "import-row-source";
    source.textContent = draft.source;
    source.title = draft.source;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "import-row-remove";
    removeBtn.setAttribute("aria-label", "この候補を削除");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      importDrafts = importDrafts.filter((d) => d.draftId !== draft.draftId);
      renderImportPreview();
    });

    top.appendChild(source);
    top.appendChild(removeBtn);

    const fields = document.createElement("div");
    fields.className = "import-row-fields";

    const typeSelect = document.createElement("select");
    typeSelect.innerHTML = EVENT_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
    typeSelect.value = draft.type;
    typeSelect.addEventListener("change", (e) => {
      draft.type = e.target.value;
    });

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = draft.date;
    dateInput.addEventListener("input", (e) => {
      draft.date = e.target.value;
    });

    const timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.value = draft.time;
    timeInput.addEventListener("input", (e) => {
      draft.time = e.target.value;
    });

    const companyInput = document.createElement("input");
    companyInput.type = "text";
    companyInput.placeholder = "企業名";
    companyInput.value = draft.company;
    companyInput.addEventListener("input", (e) => {
      draft.company = e.target.value;
    });

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "タイトル";
    titleInput.className = "span-2";
    titleInput.value = draft.title;
    titleInput.addEventListener("input", (e) => {
      draft.title = e.target.value;
    });

    fields.append(typeSelect, dateInput, timeInput, companyInput, titleInput);

    row.appendChild(top);
    row.appendChild(fields);
    importPreview.appendChild(row);
  });
}

importBtn.addEventListener("click", () => {
  importTextarea.value = "";
  importDrafts = [];
  renderImportPreview();
  importModalOverlay.hidden = false;
  importTextarea.focus();
});

importModalClose.addEventListener("click", closeImportModal);
importCancelBtn.addEventListener("click", closeImportModal);
importModalOverlay.addEventListener("click", (e) => {
  if (e.target === importModalOverlay) closeImportModal();
});

importParseBtn.addEventListener("click", () => {
  importDrafts = parseScheduleText(importTextarea.value);
  renderImportPreview();
});

importConfirmBtn.addEventListener("click", () => {
  importDrafts.forEach((draft) => {
    if (!draft.date || !draft.title) return;
    events.push({
      id: uid("evt"),
      date: draft.date,
      time: draft.time,
      type: draft.type,
      title: draft.title,
      company: draft.company,
      memo: "",
    });
  });

  saveEvents();
  render();
  importDrafts = [];
  closeImportModal();
});

populateStatusSelect();
populateEventTypeSelect();
render();
