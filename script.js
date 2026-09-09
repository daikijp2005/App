// 就活の進捗を企業ごとに管理し、ブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const STORAGE_KEY = "job-hunt-entries";

const STAGES = [
  { id: "considering", label: "検討中", color: "gray" },
  { id: "entered", label: "エントリー済み", color: "blue" },
  { id: "screening", label: "書類選考", color: "purple" },
  { id: "interview", label: "面接", color: "warning" },
  { id: "offer", label: "内定", color: "success" },
  { id: "closed", label: "見送り・辞退", color: "muted" },
];

let entries = loadEntries();
let currentView = "board";
let currentSearch = "";
let editingId = null;

const statsBox = document.getElementById("stats");
const upcomingList = document.getElementById("upcoming-list");
const upcomingEmpty = document.getElementById("upcoming-empty");
const boardView = document.getElementById("board-view");
const listView = document.getElementById("list-view");
const listViewList = document.getElementById("list-view-list");
const listEmpty = document.getElementById("list-empty");
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

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function getStage(stageId) {
  return STAGES.find((s) => s.id === stageId) || STAGES[0];
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
  const soon = entries.filter((e) => {
    const u = getUrgency(e.nextDate);
    return u && (u.level === "urgent" || u.level === "soon");
  });

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
      <span class="stat-num">${soon.length}</span>
      <span class="stat-label">直近の予定</span>
    </div>
  `;
}

function renderUpcoming() {
  const withDates = entries
    .filter((e) => e.nextDate && e.status !== "closed")
    .map((e) => ({ entry: e, urgency: getUrgency(e.nextDate) }))
    .sort((a, b) => a.urgency.diffDays - b.urgency.diffDays)
    .slice(0, 5);

  upcomingList.innerHTML = "";
  upcomingEmpty.hidden = withDates.length > 0;

  withDates.forEach(({ entry, urgency }) => {
    const li = document.createElement("li");
    li.className = `upcoming-item urgency-${urgency.level}`;
    li.innerHTML = `
      <span class="upcoming-badge">${urgency.label}</span>
      <span class="upcoming-company">${escapeHtml(entry.company)}</span>
      <span class="upcoming-action">${escapeHtml(entry.nextAction || getStage(entry.status).label)}</span>
      <span class="upcoming-date">${entry.nextDate}</span>
    `;
    li.addEventListener("click", () => openModal(entry.id));
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
}

function populateStatusSelect() {
  statusSelect.innerHTML = STAGES.map((s) => `<option value="${s.id}">${s.label}</option>`).join("");
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
  if (e.key === "Escape" && !modalOverlay.hidden) closeModal();
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
  });
});

populateStatusSelect();
render();
