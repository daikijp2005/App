// 課題データは配列として持ち、ブラウザの localStorage に保存する
const STORAGE_KEY = "assignments";

let tasks = load();
let currentFilter = "all";

const form = document.getElementById("entry-form");
const subjectInput = document.getElementById("subject-input");
const contentInput = document.getElementById("content-input");
const dueDateInput = document.getElementById("due-date-input");
const list = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const filterButtons = document.querySelectorAll(".filter-btn");
const statsBox = document.getElementById("stats");
const calendarEl = document.getElementById("calendar");

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// 今日からの残り日数を計算し、緊急度クラスを決める
function getUrgency(dueDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return { level: "urgent", label: diffDays < 0 ? "期限切れ" : diffDays === 0 ? "今日締切" : "明日締切" };
  if (diffDays <= 3) return { level: "soon", label: `あと${diffDays}日` };
  return { level: "safe", label: `あと${diffDays}日` };
}

function renderStats() {
  const open = tasks.filter((t) => !t.done);
  const dueToday = open.filter((t) => getUrgency(t.dueDate).level === "urgent").length;
  const dueThisWeek = open.filter((t) => getUrgency(t.dueDate).level === "soon").length;

  statsBox.innerHTML = `
    <div class="stat stat--danger">
      <span class="stat-num">${dueToday}</span>
      <span class="stat-label">今日・明日締切</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${dueThisWeek}</span>
      <span class="stat-label">数日以内</span>
    </div>
    <div class="stat stat--accent">
      <span class="stat-num">${open.length}</span>
      <span class="stat-label">未完了合計</span>
    </div>
  `;
}

function renderCal() {
  renderCalendar(
    calendarEl,
    tasks.map((t) => {
      const level = getUrgency(t.dueDate).level;
      const color = t.done
        ? "var(--ink-soft)"
        : level === "urgent"
        ? "var(--danger)"
        : level === "soon"
        ? "var(--warning)"
        : "var(--accent)";
      return { date: t.dueDate, label: `${t.subject}: ${t.content}${t.done ? "（完了）" : ""}`, color };
    })
  );
}

function render() {
  renderStats();
  renderCal();
  list.innerHTML = "";

  const visible = tasks.filter((task) => {
    if (currentFilter === "active") return !task.done;
    if (currentFilter === "done") return task.done;
    return true;
  });

  // 締切が近い順に並べる
  visible.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  emptyMessage.hidden = tasks.length > 0;

  visible.forEach((task) => {
    const urgency = getUrgency(task.dueDate);

    const li = document.createElement("li");
    li.className = `entry-item ${task.done ? "done" : urgency.level}`;

    li.innerHTML = `
      <input type="checkbox" ${task.done ? "checked" : ""} data-id="${task.id}" class="done-checkbox">
      <div class="entry-content">
        <strong>${escapeHtml(task.subject)}</strong>
        <span>${escapeHtml(task.content)}（${task.dueDate}）</span>
      </div>
      <span class="due-label">${task.done ? "完了" : urgency.label}</span>
      <button class="delete-btn" data-id="${task.id}" title="削除">✕</button>
    `;

    list.appendChild(li);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  tasks.push({
    id: Date.now().toString(),
    subject: subjectInput.value.trim(),
    content: contentInput.value.trim(),
    dueDate: dueDateInput.value,
    done: false,
  });

  save();
  render();
  form.reset();
  subjectInput.focus();
});

list.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains("done-checkbox")) {
    const task = tasks.find((t) => t.id === id);
    task.done = e.target.checked;
    save();
    render();
  }

  if (e.target.classList.contains("delete-btn")) {
    tasks = tasks.filter((t) => t.id !== id);
    save();
    render();
  }
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
});

render();
