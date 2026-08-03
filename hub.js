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

function showBadge(el, level) {
  el.hidden = false;
  el.dataset.level = level;
}

function shiftEarnings(shift) {
  const [sh, sm] = shift.start.split(":").map(Number);
  const [eh, em] = shift.end.split(":").map(Number);
  const hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  return Math.max(0, hours) * shift.wage;
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

// ---------- いまやること ----------

function fallbackIcon(routine) {
  if (routine.icon) return routine.icon;
  if (!routine.time) return "⭐";
  const h = parseInt(routine.time.split(":")[0], 10);
  if (h < 12) return "🌅";
  if (h < 18) return "☀️";
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

// ---------- 各ノードのバッジ / ホバー詳細 ----------

(function studyNode() {
  const el = document.querySelector('[data-node="study"]');
  const badge = el.querySelector('[data-badge="study"]');
  const open = readJSON("assignments").filter((a) => !a.done);
  if (open.length === 0) {
    el.title = "課題は登録されていません";
    return;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffs = open.map((a) => Math.round((new Date(a.dueDate) - today) / 86400000));
  const minDiff = Math.min(...diffs);
  const soonCount = diffs.filter((d) => d <= 3).length;
  if (minDiff <= 1) {
    showBadge(badge, "urgent");
    el.title = `⚠️ 締切間近 ${soonCount}件`;
  } else if (minDiff <= 3) {
    showBadge(badge, "warning");
    el.title = `もうすぐ締切 ${soonCount}件`;
  } else {
    el.title = `未完了の課題 ${open.length}件`;
  }
})();

(function peopleNode() {
  const el = document.querySelector('[data-node="people"]');
  const badge = el.querySelector('[data-badge="people"]');
  const people = readJSON("people");
  if (people.length === 0) {
    el.title = "まだ記録がありません";
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
    .filter((x) => x.days <= 7)
    .sort((a, b) => a.days - b.days);

  if (upcoming.length > 0) {
    showBadge(badge, "info");
    const { name, days } = upcoming[0];
    el.title = days === 0 ? `🎂 今日は${name}さんの誕生日` : `🎂 あと${days}日で${name}さんの誕生日`;
  } else {
    el.title = `${people.length}人を記録中`;
  }
})();

(function jobNode() {
  const el = document.querySelector('[data-node="job"]');
  const badge = el.querySelector('[data-badge="job"]');
  const companies = readJSON("jobHunting");
  if (companies.length === 0) {
    el.title = "まだ登録されていません";
    return;
  }
  const active = companies.filter((c) => c.stage !== "内定" && c.stage !== "見送り");
  const offers = companies.filter((c) => c.stage === "内定").length;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffs = companies
    .filter((c) => c.nextDate)
    .map((c) => Math.round((new Date(c.nextDate) - today) / 86400000))
    .filter((d) => d >= 0);

  if (diffs.length > 0) {
    const minDiff = Math.min(...diffs);
    if (minDiff <= 1) showBadge(badge, "urgent");
    else if (minDiff <= 3) showBadge(badge, "warning");
  }
  el.title = `選考中 ${active.length}社（内定 ${offers}社）`;
})();

(function arbeitNode() {
  const el = document.querySelector('[data-node="arbeit"]');
  const badge = el.querySelector('[data-badge="arbeit"]');
  const shifts = readJSON("arbeitShifts");
  if (shifts.length === 0) {
    el.title = "シフトは登録されていません";
    return;
  }
  const todayKey = formatDateKey(now);
  const todayShift = shifts.find((s) => s.date === todayKey);
  const thisMonth = shifts.filter((s) => s.date.slice(0, 7) === todayKey.slice(0, 7));
  const earnings = thisMonth.reduce((sum, s) => sum + shiftEarnings(s), 0);

  if (todayShift) showBadge(badge, "info");
  el.title = `今月の収入 ¥${Math.round(earnings).toLocaleString()}（${thisMonth.length}件）`;
})();

(function extracurricularNode() {
  const el = document.querySelector('[data-node="extracurricular"]');
  const badge = el.querySelector('[data-badge="extracurricular"]');
  const activities = readJSON("extracurricular");
  if (activities.length === 0) {
    el.title = "まだ登録されていません";
    return;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffs = activities
    .filter((a) => a.date)
    .map((a) => Math.round((new Date(a.date) - today) / 86400000))
    .filter((d) => d >= 0);

  if (diffs.length > 0) {
    const minDiff = Math.min(...diffs);
    if (minDiff <= 1) showBadge(badge, "urgent");
    else if (minDiff <= 3) showBadge(badge, "warning");
  }
  el.title = `${activities.length}件の活動を記録中`;
})();

(function hobbiesNode() {
  const el = document.querySelector('[data-node="hobbies"]');
  const hobbies = readJSON("hobbies");
  el.title = hobbies.length ? `${hobbies.length}件のお気に入りを記録中` : "まだ記録がありません";
})();

// ---------- 「その世界に入る」クリックモーション ----------

(function setupEnterMotion() {
  const mindMap = document.getElementById("mind-map");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  document.querySelectorAll(".mind-node[data-node]").forEach((node) => {
    node.addEventListener("click", (e) => {
      e.preventDefault();
      const href = node.getAttribute("href");
      mindMap.classList.add("entering");
      node.classList.add("entering-target");
      setTimeout(() => {
        window.location.href = href;
      }, 380);
    });
  });
})();
