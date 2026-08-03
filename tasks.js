// ルーティンは配列として持ち、ブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const STORAGE_KEY = "dailyRoutines";
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

let routines = loadRoutines();

const routineForm = document.getElementById("routine-form");
const iconInput = document.getElementById("icon-input");
const nameInput = document.getElementById("name-input");
const timeInput = document.getElementById("time-input");
const daysRow = document.getElementById("days-row");
const routineList = document.getElementById("routine-list");
const emptyMessage = document.getElementById("empty-message");
const statsBox = document.getElementById("stats");
const heatmap = document.getElementById("heatmap");

const nowClockEl = document.getElementById("now-clock");
const nowStatusLabelEl = document.getElementById("now-status-label");
const nowTaskNameEl = document.getElementById("now-task-name");
const nowTaskMetaEl = document.getElementById("now-task-meta");
const nowCompleteBtn = document.getElementById("now-complete-btn");
const nowNextEl = document.getElementById("now-next");
const nowCardEl = document.getElementById("now-card");

let selectedDays = new Set(ALL_DAYS);

function loadRoutines() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveRoutines() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// 時刻から「朝/昼/夜/いつでも」を判定し、デフォルトアイコンとグループ名を返す
function timeGroup(time) {
  if (!time) return { key: "anytime", label: "いつでも", icon: "⭐" };
  const hour = parseInt(time.split(":")[0], 10);
  if (hour < 12) return { key: "morning", label: "朝", icon: "🌅" };
  if (hour < 18) return { key: "afternoon", label: "昼", icon: "☀️" };
  return { key: "evening", label: "夜", icon: "🌙" };
}

function routineIcon(routine) {
  return routine.icon || timeGroup(routine.time).icon;
}

function dayLabel(days) {
  if (days.length === 7) return "毎日";
  return [...days].sort().map((d) => DAY_LABELS[d]).join("・");
}

// そのルーティンの連続達成日数（曜日指定外の日はスキップしてカウント）
function calcStreak(routine) {
  let streak = 0;
  const d = todayStart();
  const todayKey = formatDateKey(d);
  const scheduledToday = routine.days.includes(d.getDay());
  const doneToday = !!routine.history[todayKey];

  if (scheduledToday && !doneToday) {
    d.setDate(d.getDate() - 1);
  }

  for (let guard = 0; guard < 1000; guard++) {
    if (routine.days.includes(d.getDay())) {
      const key = formatDateKey(d);
      if (routine.history[key]) {
        streak++;
      } else {
        break;
      }
    }
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

// 「いま何をやるべきか」を決める：
// 1. 時刻指定があり、すでに時刻を過ぎていて未完了 → 一番早いものが「いま」
// 2. それが無ければ、時刻未指定（いつでも）の未完了タスクが「いま」
// 3. それも無ければ、次に控えている未来のタスクを「つぎ」として表示
function computeNow() {
  const now = new Date();
  const nowKey = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const todayKey = formatDateKey(now);
  const todayDow = now.getDay();

  const todays = routines.filter((r) => r.days.includes(todayDow));
  const pending = todays.filter((r) => !r.history[todayKey]);

  if (todays.length === 0) return { status: "empty" };
  if (pending.length === 0) return { status: "done", total: todays.length };

  const timed = pending
    .filter((r) => r.time)
    .sort((a, b) => a.time.localeCompare(b.time));
  const anytime = pending.filter((r) => !r.time);

  const due = timed.filter((r) => r.time <= nowKey);
  const upcoming = timed.filter((r) => r.time > nowKey);

  if (due.length > 0) {
    const task = due[0];
    const next = due[1] || anytime[0] || upcoming[0] || null;
    return { status: "now", task, next };
  }

  if (anytime.length > 0) {
    const task = anytime[0];
    const next = upcoming[0] || anytime[1] || null;
    return { status: "now", task, next };
  }

  return { status: "upcoming", task: upcoming[0], next: upcoming[1] || null };
}

function minutesUntil(time) {
  const now = new Date();
  const [h, m] = time.split(":").map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return Math.max(0, Math.round((target - now) / 60000));
}

function formatDuration(totalMinutes) {
  if (totalMinutes < 60) return `${totalMinutes}分`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
}

function renderNowCard() {
  const now = new Date();
  nowClockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const result = computeNow();
  nowCardEl.classList.remove("state-now", "state-upcoming", "state-done", "state-empty");
  nowCardEl.classList.add(`state-${result.status}`);

  if (result.status === "empty") {
    nowStatusLabelEl.textContent = "今日の予定";
    nowTaskNameEl.textContent = "ルーティンがまだ登録されていません";
    nowTaskMetaEl.textContent = "下のフォームから追加してみましょう";
    nowCompleteBtn.hidden = true;
    nowNextEl.textContent = "";
    return;
  }

  if (result.status === "done") {
    nowStatusLabelEl.textContent = "きょうの状況";
    nowTaskNameEl.textContent = `🎉 今日のルーティンは全部完了！（${result.total}件）`;
    nowTaskMetaEl.textContent = "お疲れさまでした";
    nowCompleteBtn.hidden = true;
    nowNextEl.textContent = "";
    return;
  }

  const task = result.task;
  nowStatusLabelEl.textContent = result.status === "now" ? "いまやること" : "つぎの予定";
  nowTaskNameEl.textContent = `${routineIcon(task)} ${task.name}`;

  if (result.status === "now") {
    nowTaskMetaEl.textContent = task.time ? `${task.time} 〜` : "いつでも";
  } else {
    nowTaskMetaEl.textContent = `${task.time} まで、あと${formatDuration(minutesUntil(task.time))}`;
  }

  nowCompleteBtn.hidden = false;
  nowCompleteBtn.dataset.id = task.id;
  nowCompleteBtn.textContent = result.status === "now" ? "これ、やった ✓" : "先に済ませた ✓";

  if (result.next) {
    nowNextEl.textContent = `次: ${routineIcon(result.next)} ${result.next.name}${result.next.time ? `（${result.next.time}）` : ""}`;
  } else {
    nowNextEl.textContent = "";
  }
}

function renderStats() {
  const now = new Date();
  const todayKey = formatDateKey(now);
  const todays = routines.filter((r) => r.days.includes(now.getDay()));
  const doneToday = todays.filter((r) => r.history[todayKey]).length;
  const rate = todays.length ? Math.round((doneToday / todays.length) * 100) : 0;
  const bestStreak = routines.reduce((max, r) => Math.max(max, calcStreak(r)), 0);

  statsBox.innerHTML = `
    <div class="stat stat--accent">
      <span class="stat-num">${rate}%</span>
      <span class="stat-label">今日の達成率</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${bestStreak}</span>
      <span class="stat-label">最長ストリーク（日）</span>
    </div>
    <div class="stat">
      <span class="stat-num">${routines.length}</span>
      <span class="stat-label">登録ルーティン数</span>
    </div>
  `;
}

function renderHeatmap() {
  const totalWeeks = 9;
  const today = todayStart();
  const endSunday = new Date(today);
  endSunday.setDate(today.getDate() - today.getDay());
  const startSunday = new Date(endSunday);
  startSunday.setDate(endSunday.getDate() - (totalWeeks - 1) * 7);

  const cells = [];
  const cursor = new Date(startSunday);
  for (let i = 0; i < totalWeeks * 7; i++) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  heatmap.innerHTML = "";
  cells.forEach((date) => {
    const cell = document.createElement("div");

    if (date > today) {
      cell.className = "heat-cell level-future";
      heatmap.appendChild(cell);
      return;
    }

    const key = formatDateKey(date);
    const scheduled = routines.filter((r) => r.days.includes(date.getDay()));
    const done = scheduled.filter((r) => r.history[key]).length;
    const ratio = scheduled.length ? done / scheduled.length : null;

    let level = 0;
    if (ratio !== null) {
      if (ratio >= 1) level = 4;
      else if (ratio >= 0.67) level = 3;
      else if (ratio >= 0.34) level = 2;
      else if (ratio > 0) level = 1;
    }

    cell.className = `heat-cell level-${level}`;
    const label = `${date.getMonth() + 1}/${date.getDate()}（${DAY_LABELS[date.getDay()]}）`;
    cell.title = scheduled.length ? `${label}: ${done}/${scheduled.length} 達成` : `${label}: 予定なし`;
    heatmap.appendChild(cell);
  });
}

function renderRoutineList() {
  routineList.innerHTML = "";
  emptyMessage.hidden = routines.length > 0;

  const now = new Date();
  const todayKey = formatDateKey(now);
  const todayDow = now.getDay();

  const sorted = routines.slice().sort((a, b) => {
    const groupOrder = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };
    const ga = groupOrder[timeGroup(a.time).key];
    const gb = groupOrder[timeGroup(b.time).key];
    if (ga !== gb) return ga - gb;
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return 0;
  });

  sorted.forEach((routine) => {
    const scheduledToday = routine.days.includes(todayDow);
    const doneToday = !!routine.history[todayKey];
    const streak = calcStreak(routine);

    const li = document.createElement("li");
    li.className = `entry-item routine-item ${scheduledToday ? "" : "off-today"} ${doneToday ? "done" : ""}`;

    const checkboxHtml = scheduledToday
      ? `<input type="checkbox" ${doneToday ? "checked" : ""} data-id="${routine.id}" class="done-checkbox">`
      : `<span class="off-today-mark" title="今日は対象外">・</span>`;

    li.innerHTML = `
      ${checkboxHtml}
      <div class="entry-content">
        <strong>${routineIcon(routine)} ${escapeHtml(routine.name)}</strong>
        <span>${routine.time ? routine.time : "いつでも"} ・ ${dayLabel(routine.days)}</span>
      </div>
      ${streak > 0 ? `<span class="streak-badge">🔥${streak}</span>` : ""}
      <button class="delete-btn" data-id="${routine.id}" title="削除">✕</button>
    `;

    routineList.appendChild(li);
  });
}

function render() {
  renderNowCard();
  renderStats();
  renderHeatmap();
  renderRoutineList();
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function buildDaysRow() {
  daysRow.innerHTML = "";
  ALL_DAYS.forEach((day) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-toggle active";
    btn.textContent = DAY_LABELS[day];
    btn.dataset.day = day;
    btn.addEventListener("click", () => {
      if (selectedDays.has(day)) {
        selectedDays.delete(day);
        btn.classList.remove("active");
      } else {
        selectedDays.add(day);
        btn.classList.add("active");
      }
    });
    daysRow.appendChild(btn);
  });
}

routineForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (selectedDays.size === 0) {
    alert("曜日を最低1つ選んでください");
    return;
  }

  routines.push({
    id: Date.now().toString(),
    icon: iconInput.value.trim(),
    name: nameInput.value.trim(),
    time: timeInput.value || null,
    days: [...selectedDays].sort(),
    history: {},
  });

  saveRoutines();
  render();
  routineForm.reset();
  selectedDays = new Set(ALL_DAYS);
  buildDaysRow();
  nameInput.focus();
});

function toggleDoneToday(id) {
  const routine = routines.find((r) => r.id === id);
  if (!routine) return;
  const todayKey = formatDateKey(new Date());
  if (routine.history[todayKey]) {
    delete routine.history[todayKey];
  } else {
    routine.history[todayKey] = true;
  }
  saveRoutines();
  render();
}

routineList.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains("done-checkbox")) {
    toggleDoneToday(id);
  }

  if (e.target.classList.contains("delete-btn")) {
    routines = routines.filter((r) => r.id !== id);
    saveRoutines();
    render();
  }
});

nowCompleteBtn.addEventListener("click", () => {
  const id = nowCompleteBtn.dataset.id;
  if (id) toggleDoneToday(id);
});

buildDaysRow();
render();

// 時計・「いま」表示を定期的に更新する（日付が変わった場合も自動で反映される）
setInterval(render, 20000);
