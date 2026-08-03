// 6項目すべてを横断して読み込み、ひとつのカレンダーと予定リストにまとめる
const CATEGORY_LABELS = {
  study: "学業",
  job: "就職活動",
  arbeit: "アルバイト",
  extracurricular: "課外活動",
  people: "人",
};

const list = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const statsBox = document.getElementById("stats");
const calendarEl = document.getElementById("calendar");

function readJSON(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

function formatKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysUntilNum(dateKey) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateKey);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function daysLabel(dateKey) {
  const diff = daysUntilNum(dateKey);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  return `あと${diff}日`;
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// 未来の予定だけを日付順に集める（誕生日は直近1回だけ）
function collectUpcoming() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = formatKey(today);
  const items = [];

  readJSON("assignments").forEach((a) => {
    if (a.done) return;
    items.push({
      date: a.dueDate,
      label: `${a.subject}: ${a.content}`,
      category: "study",
      color: "var(--cat-study)",
      checkable: true,
      sourceId: a.id,
      href: "study.html",
    });
  });

  readJSON("jobHunting").forEach((c) => {
    if (!c.nextDate || c.stage === "内定" || c.stage === "見送り") return;
    items.push({ date: c.nextDate, label: `${c.company}（${c.stage}）`, category: "job", color: "var(--cat-job)", href: "job.html" });
  });

  readJSON("arbeitShifts").forEach((s) => {
    items.push({ date: s.date, label: `シフト ${s.start}〜${s.end}`, category: "arbeit", color: "var(--cat-arbeit)", href: "arbeit.html" });
  });

  readJSON("extracurricular").forEach((a) => {
    if (!a.date) return;
    items.push({ date: a.date, label: a.name, category: "extracurricular", color: "var(--cat-extracurricular)", href: "extracurricular.html" });
  });

  readJSON("people").forEach((p) => {
    if (!p.specialDate) return;
    const [, mm, dd] = p.specialDate.split("-").map(Number);
    let next = new Date(today.getFullYear(), mm - 1, dd);
    if (next < today) next = new Date(today.getFullYear() + 1, mm - 1, dd);
    items.push({
      date: formatKey(next),
      label: `🎂 ${p.name}さんの誕生日`,
      category: "people",
      color: "var(--cat-people)",
      href: "people.html",
    });
  });

  return items.filter((it) => it.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date));
}

// カレンダー表示用には過去〜将来まで全部、誕生日は今年・来年分を載せる
function collectForCalendar() {
  const items = [];

  readJSON("assignments").forEach((a) => {
    items.push({ date: a.dueDate, label: `📚 ${a.subject}: ${a.content}`, color: "var(--cat-study)" });
  });
  readJSON("jobHunting").forEach((c) => {
    if (c.nextDate) items.push({ date: c.nextDate, label: `💼 ${c.company}（${c.stage}）`, color: "var(--cat-job)" });
  });
  readJSON("arbeitShifts").forEach((s) => {
    items.push({ date: s.date, label: `⏰ シフト ${s.start}〜${s.end}`, color: "var(--cat-arbeit)" });
  });
  readJSON("extracurricular").forEach((a) => {
    if (a.date) items.push({ date: a.date, label: `🎪 ${a.name}`, color: "var(--cat-extracurricular)" });
  });

  const now = new Date();
  readJSON("people").forEach((p) => {
    if (!p.specialDate) return;
    const [, mm, dd] = p.specialDate.split("-");
    [now.getFullYear(), now.getFullYear() + 1].forEach((y) => {
      items.push({ date: `${y}-${mm}-${dd}`, label: `🎂 ${p.name}`, color: "var(--cat-people)" });
    });
  });

  return items;
}

function renderStats() {
  const upcoming = collectUpcoming();
  const within7 = upcoming.filter((it) => daysUntilNum(it.date) <= 7).length;

  const routines = readJSON("dailyRoutines");
  const todayDow = new Date().getDay();
  const todayKey = formatKey(new Date());
  const todays = routines.filter((r) => r.days.includes(todayDow));
  const doneToday = todays.filter((r) => r.history[todayKey]).length;
  const rate = todays.length ? Math.round((doneToday / todays.length) * 100) : 0;

  const total = ["hobbies", "people", "assignments", "jobHunting", "arbeitShifts", "extracurricular"].reduce(
    (sum, key) => sum + readJSON(key).length,
    0
  );

  statsBox.innerHTML = `
    <div class="stat stat--warning">
      <span class="stat-num">${within7}</span>
      <span class="stat-label">7日以内の予定</span>
    </div>
    <div class="stat stat--accent">
      <span class="stat-num">${rate}%</span>
      <span class="stat-label">今日のルーティン達成率</span>
    </div>
    <div class="stat">
      <span class="stat-num">${total}</span>
      <span class="stat-label">登録項目 合計</span>
    </div>
  `;
}

function renderCal() {
  renderCalendar(calendarEl, collectForCalendar());
}

function renderList() {
  const items = collectUpcoming();
  list.innerHTML = "";
  emptyMessage.hidden = items.length > 0;

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.style.borderLeftColor = item.color;

    const marker = item.checkable
      ? `<input type="checkbox" class="done-checkbox" data-source="${item.category}" data-id="${item.sourceId}">`
      : `<span class="cat-dot" style="background:${item.color}"></span>`;

    li.innerHTML = `
      ${marker}
      <div class="entry-content">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${item.date}（${daysLabel(item.date)}）</span>
      </div>
      <a class="entry-tag" href="${item.href}" style="color:${item.color}">${CATEGORY_LABELS[item.category]}</a>
    `;
    list.appendChild(li);
  });
}

function renderAll() {
  renderStats();
  renderCal();
  renderList();
}

list.addEventListener("click", (e) => {
  if (!e.target.classList.contains("done-checkbox")) return;
  const id = e.target.dataset.id;
  const assignments = readJSON("assignments");
  const assignment = assignments.find((a) => a.id === id);
  if (assignment) {
    assignment.done = true;
    localStorage.setItem("assignments", JSON.stringify(assignments));
  }
  renderAll();
});

renderAll();
