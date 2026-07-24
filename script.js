// 課題データは配列として持ち、ブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const STORAGE_KEY = "assignments";

let tasks = loadTasks();
let currentFilter = "all";

const form = document.getElementById("task-form");
const subjectInput = document.getElementById("subject");
const contentInput = document.getElementById("content");
const dueDateInput = document.getElementById("due-date");
const taskList = document.getElementById("task-list");
const emptyMessage = document.getElementById("empty-message");
const filterButtons = document.querySelectorAll(".filter-btn");
const statsBox = document.getElementById("stats");

function loadTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
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

// 今日/今週締切の件数をまとめて、一目で状況がわかるようにする
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
    <div class="stat">
      <span class="stat-num">${open.length}</span>
      <span class="stat-label">未完了合計</span>
    </div>
  `;
}

function render() {
  renderStats();
  taskList.innerHTML = "";

  const visibleTasks = tasks.filter((task) => {
    if (currentFilter === "active") return !task.done;
    if (currentFilter === "done") return task.done;
    return true;
  });

  // 締切が近い順に並べる
  visibleTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  emptyMessage.hidden = tasks.length > 0;

  visibleTasks.forEach((task) => {
    const urgency = getUrgency(task.dueDate);

    const li = document.createElement("li");
    li.className = `task-item ${task.done ? "done" : urgency.level}`;

    li.innerHTML = `
      <input type="checkbox" ${task.done ? "checked" : ""} data-id="${task.id}" class="done-checkbox">
      <div class="task-content">
        <strong>${escapeHtml(task.subject)}</strong>
        <span>${escapeHtml(task.content)}（${task.dueDate}）</span>
      </div>
      <span class="due-label">${task.done ? "完了" : urgency.label}</span>
      <button class="delete-btn" data-id="${task.id}" title="削除">✕</button>
    `;

    taskList.appendChild(li);
  });
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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

  saveTasks();
  render();
  form.reset();
  subjectInput.focus();
});

taskList.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains("done-checkbox")) {
    const task = tasks.find((t) => t.id === id);
    task.done = e.target.checked;
    saveTasks();
    render();
  }

  if (e.target.classList.contains("delete-btn")) {
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks();
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
