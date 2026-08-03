// 課外活動は配列として持ち、ブラウザの localStorage に保存する
const STORAGE_KEY = "extracurricular";
const CATEGORY_ICONS = {
  "サークル": "🎸",
  "ボランティア": "🤝",
  "大会・イベント": "🏆",
  "その他": "✨",
};

let activities = load();

const form = document.getElementById("entry-form");
const nameInput = document.getElementById("name-input");
const categoryInput = document.getElementById("category-input");
const noteInput = document.getElementById("note-input");
const dateInput = document.getElementById("date-input");
const list = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const statsBox = document.getElementById("stats");
const calendarEl = document.getElementById("calendar");

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function renderStats() {
  const categories = new Set(activities.map((a) => a.category));
  const upcoming = activities.filter((a) => a.date && daysUntil(a.date) >= 0 && daysUntil(a.date) <= 7).length;

  statsBox.innerHTML = `
    <div class="stat stat--accent">
      <span class="stat-num">${activities.length}</span>
      <span class="stat-label">登録件数</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${upcoming}</span>
      <span class="stat-label">7日以内の予定</span>
    </div>
    <div class="stat">
      <span class="stat-num">${categories.size}</span>
      <span class="stat-label">カテゴリ数</span>
    </div>
  `;
}

function renderCal() {
  renderCalendar(
    calendarEl,
    activities
      .filter((a) => a.date)
      .map((a) => ({ date: a.date, label: `${CATEGORY_ICONS[a.category] || "✨"} ${a.name}` }))
  );
}

function render() {
  renderStats();
  renderCal();
  list.innerHTML = "";
  emptyMessage.hidden = activities.length > 0;

  const sorted = activities.slice().sort((a, b) => {
    const da = a.date ? daysUntil(a.date) : 999;
    const db = b.date ? daysUntil(b.date) : 999;
    return da - db;
  });

  sorted.forEach((activity) => {
    const li = document.createElement("li");
    li.className = "entry-item";

    const dateLabel = activity.date ? ` ・ ${activity.date}` : "";

    li.innerHTML = `
      <div class="entry-content">
        <strong>${CATEGORY_ICONS[activity.category] || "✨"} ${escapeHtml(activity.name)}</strong>
        <span>${escapeHtml(activity.note || "")}${dateLabel}</span>
      </div>
      <span class="entry-tag">${escapeHtml(activity.category)}</span>
      <button class="delete-btn" data-id="${activity.id}" title="削除">✕</button>
    `;
    list.appendChild(li);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  activities.push({
    id: Date.now().toString(),
    name: nameInput.value.trim(),
    category: categoryInput.value,
    note: noteInput.value.trim(),
    date: dateInput.value || null,
  });

  save();
  render();
  form.reset();
  nameInput.focus();
});

list.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  activities = activities.filter((a) => a.id !== id);
  save();
  render();
});

render();
