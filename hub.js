const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const now = new Date();

function readJSON(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ---------- 挨拶と日付 ----------

const hour = now.getHours();
let greeting = "こんにちは";
if (hour < 5) greeting = "おつかれさまです";
else if (hour < 11) greeting = "おはようございます";
else if (hour < 18) greeting = "こんにちは";
else greeting = "こんばんは";

document.getElementById("greeting").textContent = greeting;
document.getElementById("date-line").textContent =
  `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${DAY_LABELS[now.getDay()]}）`;

// ---------- いまやること（tasksページのルーティンから簡易表示） ----------

function fallbackIcon(routine) {
  if (routine.icon) return routine.icon;
  if (!routine.time) return "⭐";
  const hour = parseInt(routine.time.split(":")[0], 10);
  if (hour < 12) return "🌅";
  if (hour < 18) return "☀️";
  return "🌙";
}

(function renderNowStrip() {
  const taskEl = document.getElementById("now-strip-task");
  const routines = readJSON("dailyRoutines");
  const todayKey = formatDateKey(now);
  const todayDow = now.getDay();
  const nowKey = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const todays = routines.filter((r) => r.days.includes(todayDow));
  if (todays.length === 0) {
    taskEl.textContent = "ルーティンが未登録です";
    return;
  }

  const pending = todays.filter((r) => !r.history[todayKey]);
  if (pending.length === 0) {
    taskEl.textContent = "🎉 今日の分はすべて完了！";
    return;
  }

  const timed = pending.filter((r) => r.time).sort((a, b) => a.time.localeCompare(b.time));
  const anytime = pending.filter((r) => !r.time);
  const due = timed.filter((r) => r.time <= nowKey);
  const current = due[0] || anytime[0] || timed[0];

  taskEl.textContent = current ? `${fallbackIcon(current)} ${current.name}` : "予定を確認しましょう";
})();

// ---------- 各カードのサマリー ----------

const hobbies = readJSON("hobbies");
document.getElementById("summary-hobbies").textContent = hobbies.length
  ? `${hobbies.length}件のお気に入りを記録中`
  : "まだ記録がありません";

(function renderPeopleSummary() {
  const people = readJSON("people");
  const el = document.getElementById("summary-people");
  if (people.length === 0) {
    el.textContent = "まだ記録がありません";
    return;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = people
    .filter((p) => p.specialDate)
    .map((p) => {
      const [, mm, dd] = p.specialDate.split("-").map(Number);
      let next = new Date(now.getFullYear(), mm - 1, dd);
      if (next < today) next = new Date(now.getFullYear() + 1, mm - 1, dd);
      return { name: p.name, days: Math.round((next - today) / 86400000) };
    })
    .filter((x) => x.days <= 30)
    .sort((a, b) => a.days - b.days);

  if (upcoming.length > 0) {
    const { name, days } = upcoming[0];
    el.textContent = days === 0 ? `🎂 今日は${name}さんの誕生日！` : `🎂 あと${days}日で${name}さんの誕生日`;
  } else {
    el.textContent = `${people.length}人を記録中`;
  }
})();

(function renderTasksSummary() {
  const el = document.getElementById("summary-tasks");
  const routines = readJSON("dailyRoutines");
  if (routines.length === 0) {
    el.textContent = "ルーティン未登録";
    return;
  }

  const todayDow = now.getDay();
  const todays = routines.filter((r) => r.days.includes(todayDow));
  if (todays.length === 0) {
    el.textContent = "今日の予定はありません";
    return;
  }

  const todayKey = formatDateKey(now);
  const done = todays.filter((r) => r.history[todayKey]).length;
  const rate = Math.round((done / todays.length) * 100);
  el.textContent = `今日の達成率 ${rate}%（${done}/${todays.length}）`;
})();

(function renderStudySummary() {
  const el = document.getElementById("summary-study");
  const assignments = readJSON("assignments");
  if (assignments.length === 0) {
    el.textContent = "課題は登録されていません";
    return;
  }

  const open = assignments.filter((a) => !a.done);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const soon = open.filter((a) => Math.round((new Date(a.dueDate) - today) / 86400000) <= 3);
  el.textContent = soon.length > 0 ? `⚠️ 提出間近 ${soon.length}件` : `未完了の課題 ${open.length}件`;
})();

(function renderJobSummary() {
  const el = document.getElementById("summary-job");
  const companies = readJSON("jobHunting");
  if (companies.length === 0) {
    el.textContent = "まだ登録されていません";
    return;
  }

  const active = companies.filter((c) => c.stage !== "内定" && c.stage !== "見送り");
  const offers = companies.filter((c) => c.stage === "内定").length;
  el.textContent = `選考中 ${active.length}社（内定 ${offers}社）`;
})();
