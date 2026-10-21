// データはすべてブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const KEYS = {
  tasks: "assignments", // 以前のバージョンと同じキー。登録済みの課題をそのまま引き継ぐ
  courses: "courses",
  sessions: "sessions",
  settings: "settings",
  autoKeys: "autoTaskKeys",
};

const DAYS = ["月", "火", "水", "木", "金", "土"];
const WEEKDAY_CHARS = "月火水木金土日";
const COLORS = ["blue", "green", "orange", "red", "purple", "teal"];
const ATTENDANCE = { present: "出席", late: "遅刻", absent: "欠席" };
const SOURCE_LABELS = { memo: "メモから自動", recurring: "毎回の課題", import: "お知らせから" };
const ABSENCE_REASONS = ["体調不良", "発熱", "通院", "就職活動", "忌引き", "公欠（部活動・大会等）", "交通機関の遅延", "家庭の事情", "その他"];
const REASON_PHRASES = { "公欠（部活動・大会等）": "部活動・大会等への参加（公欠）", "その他": "やむを得ない事情" };
const REMINDER_CHOICES = [7, 3, 2, 1, 0];
const DEFAULT_SETTINGS = {
  studentName: "",
  studentId: "",
  termStart: "",
  termEnd: "",
  showSaturday: false,
  periodCount: 5,
  periodTimes: [
    ["08:50", "10:30"], ["10:40", "12:20"], ["13:10", "14:50"], ["15:05", "16:45"],
    ["17:00", "18:40"], ["18:50", "20:30"], ["20:40", "22:20"],
  ],
  reminderDays: [3, 1, 0],
};

// メモやお知らせ文の中で「課題らしい行」を見分けるためのキーワード
const TASK_KEYWORDS = /課題|宿題|レポート|提出|小テスト|テスト|予習|復習|リアクションペーパー|リアペ|発表|レジュメ|ワークシート|演習問題/;

// アーティファクトなどの埋め込み表示ではブラウザ通知やファイルの書き出しが使えない
const IN_FRAME = window.self !== window.top;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境（プライベートモードなど）でも画面はそのまま使える
  }
}

let tasks = load(KEYS.tasks, []);
let courses = load(KEYS.courses, []);
let sessions = load(KEYS.sessions, []);
let settings = { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) };
// 自動登録した課題の目印。削除した課題が再び自動登録されないように覚えておく
let autoKeys = new Set(load(KEYS.autoKeys, []));

let currentFilter = "all";
let activeCourseId = null;
let draftGrading = [];
let draftColor = COLORS[0];
let importDrafts = [];

const saveTasks = () => persist("tasks");
const saveCourses = () => persist("courses");
const saveSessions = () => persist("sessions");
const saveSettings = () => persist("settings");
const saveAutoKeys = () => persist("autoKeys");

// ---------- クラウド保存（Claude のアーティファクトとして開いたとき） ----------
// localStorage はこの端末だけの控え。アーティファクトでは本人だけが読み書きできる db に保存し、
// どの端末から開いても同じ時間割・課題を使えるようにする

const STATE_KEYS = Object.keys(KEYS);
const remote = { db: null, uid: null, writing: {}, queued: {}, retried: {}, readOnly: false };

function currentValue(key) {
  if (key === "tasks") return tasks;
  if (key === "courses") return courses;
  if (key === "sessions") return sessions;
  if (key === "settings") return settings;
  return [...autoKeys];
}

function applyState(key, value) {
  const copy = JSON.parse(JSON.stringify(value));
  if (key === "tasks") tasks = copy;
  else if (key === "courses") courses = copy;
  else if (key === "sessions") sessions = copy;
  else if (key === "settings") settings = { ...DEFAULT_SETTINGS, ...copy };
  else autoKeys = new Set(copy);
  save(KEYS[key], currentValue(key));
}

const remoteDoc = (key) => remote.db.collection(`data/users/${remote.uid}`).doc(key);

function persist(key) {
  const value = JSON.parse(JSON.stringify(currentValue(key)));
  save(KEYS[key], value);
  if (!remote.db || remote.readOnly) return;
  remote.queued[key] = value;
  flush(key);
}

// 同じドキュメントへの書き込みは1件ずつ。書き込み中に変更があれば最新の内容だけを続けて送る
async function flush(key) {
  if (remote.writing[key] || !(key in remote.queued)) return;
  const value = remote.queued[key];
  delete remote.queued[key];
  remote.writing[key] = true;
  try {
    await remoteDoc(key).set({ value });
    remote.retried[key] = false;
  } catch (e) {
    if (e?.code === "unavailable" && !remote.retried[key]) {
      remote.retried[key] = true;
      setTimeout(() => {
        if (!(key in remote.queued)) remote.queued[key] = value;
        flush(key);
      }, 1000 + Math.random() * 1500);
    } else if (e?.code === "quota_exceeded") {
      showToast("保存容量の上限に達しました。完了した課題や古い記録を削除してください");
    } else if (e?.code === "invalid_argument") {
      remote.readOnly = true;
      showToast("このアプリを編集する権限がないため、変更はこの端末にだけ保存されます");
    } else {
      showToast("クラウドへの保存に失敗しました。変更はこの端末に残っています");
    }
  } finally {
    remote.writing[key] = false;
    flush(key);
  }
}

async function connectRemote() {
  if (!window.claude?.use) return;
  try {
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    const uid = db && user ? await user.id() : null;
    if (!uid) return;
    remote.db = db;
    remote.uid = uid;

    const snaps = await Promise.all(STATE_KEYS.map((key) => remoteDoc(key).get()));
    if (snaps.some((snap) => snap.exists)) {
      snaps.forEach((snap, i) => snap.exists && applyState(STATE_KEYS[i], snap.data().value));
    } else if (tasks.length || courses.length || sessions.length) {
      // この端末に以前のデータがあれば、初回にクラウドへ移す
      STATE_KEYS.forEach(persist);
    }

    // 別の端末で変更されたら反映する
    STATE_KEYS.forEach((key) => {
      remoteDoc(key).onSnapshot(
        (snap) => {
          if (!snap.exists || snap.metadata.hasPendingWrites || remote.writing[key] || key in remote.queued) return;
          const value = snap.data().value;
          if (JSON.stringify(value) === JSON.stringify(currentValue(key))) return;
          applyState(key, value);
          renderAll();
        },
        () => {},
      );
    });
  } catch {
    // クラウドが使えないときはこの端末の保存だけで動かす
  }
}

const $ = (id) => document.getElementById(id);

const timetableEl = $("timetable");
const todayPanel = $("today-panel");
const statsBox = $("stats");
const taskForm = $("task-form");
const taskCourseSelect = $("task-course");
const subjectInput = $("subject");
const contentInput = $("content");
const dueDateInput = $("due-date");
const dueTimeInput = $("due-time");
const taskList = $("task-list");
const emptyMessage = $("empty-message");
const filterButtons = document.querySelectorAll(".filter-btn");
const courseDialog = $("course-dialog");
const settingsDialog = $("settings-dialog");
const infoForm = $("info-form");
const sessionForm = $("session-form");
const absenceForm = $("absence-form");
const courseTaskForm = $("course-task-form");
const recurringForm = $("recurring-form");
const settingsForm = $("settings-form");
const toastsEl = $("toasts");

// ---------- 日付まわり ----------

const pad = (n) => String(n).padStart(2, "0");

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026-10-21" をローカル時刻の0時として読む（new Date(str) だとUTC扱いになるため）
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const daysBetween = (from, to) => Math.round((to - from) / 86400000);

// 月曜=0 … 日曜=6
const dayIndex = (date) => (date.getDay() + 6) % 7;

function formatDate(str) {
  const d = parseDate(str);
  return `${d.getMonth() + 1}/${d.getDate()}（${"日月火水木金土"[d.getDay()]}）`;
}

function formatDateJa(str) {
  const d = parseDate(str);
  return `${d.getMonth() + 1}月${d.getDate()}日（${"日月火水木金土"[d.getDay()]}）`;
}

function nextClassDate(course, from, inclusive = false) {
  for (let i = inclusive ? 0 : 1; i <= 7; i++) {
    const d = addDays(from, i);
    if (dayIndex(d) === course.day) return d;
  }
  return addDays(from, 7);
}

function latestClassDate(course, from) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, -i);
    if (dayIndex(d) === course.day) return d;
  }
  return from;
}

function classDatesBetween(course, start, end) {
  const dates = [];
  for (let d = nextClassDate(course, start, true); d <= end; d = addDays(d, 7)) dates.push(d);
  return dates;
}

// 学期開始日が設定されていれば日付から「第○回」を数え、なければ記録済みの回数から推定する
function sessionNumberFor(course, dateStr) {
  if (settings.termStart && dateStr >= settings.termStart) {
    return classDatesBetween(course, parseDate(settings.termStart), parseDate(dateStr)).length;
  }
  return sessions.filter((s) => s.courseId === course.id && s.date < dateStr).length + 1;
}

function periodTime(period) {
  return settings.periodTimes[period - 1] || ["", ""];
}

function slotLabel(course) {
  const [start, end] = periodTime(course.period);
  return `${DAYS[course.day]}曜 ${course.period}限${start ? ` · ${start}–${end}` : ""}`;
}

// ---------- 課題 ----------

const courseById = (id) => courses.find((c) => c.id === id);

function taskCourseName(task) {
  const course = courseById(task.courseId);
  return course ? course.name : task.subject || "（科目なし）";
}

const daysLeft = (task) => daysBetween(today(), parseDate(task.dueDate));
const isPast = (dateStr) => parseDate(dateStr) < today();

function dueDateTime(task) {
  const d = parseDate(task.dueDate);
  const [h, m] = (task.dueTime || "23:59").split(":").map(Number);
  d.setHours(h, m);
  return d;
}

const byDue = (a, b) => dueDateTime(a) - dueDateTime(b);

// 今日からの残り日数を計算し、緊急度クラスを決める
function getUrgency(dueDateStr) {
  const diffDays = daysBetween(today(), parseDate(dueDateStr));

  if (diffDays <= 1) return { level: "urgent", label: diffDays < 0 ? "期限切れ" : diffDays === 0 ? "今日締切" : "明日締切" };
  if (diffDays <= 3) return { level: "soon", label: `あと${diffDays}日` };
  return { level: "safe", label: `あと${diffDays}日` };
}

function addTask({ courseId = null, subject = "", content, dueDate, dueTime = "23:59", source = "manual", sessionId = null, autoKey = null }) {
  if (autoKey) {
    if (autoKeys.has(autoKey)) return null;
    autoKeys.add(autoKey);
  }
  // 登録した時点で既に過ぎているリマインドは通知済み扱いにする（追加した直後に通知が鳴らないように）
  const left = daysBetween(today(), parseDate(dueDate));
  const notified = [...settings.reminderDays, -1].filter((d) => left <= d);
  const task = { id: newId(), courseId, subject, content, dueDate, dueTime, done: false, source, sessionId, notified };
  tasks.push(task);
  return task;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- 自動登録: 文章から締切を読み取る ----------

function cleanLine(raw) {
  return raw.replace(/^[\s・\-*●○■□◆◇>＞]+/, "").trim();
}

// 「10/28」「来週金曜まで」「次回まで」などの表現から締切日時を求める
function parseDeadline(text, base, course) {
  let date = null;
  let m;

  if ((m = text.match(/(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})/))) {
    date = new Date(+m[1], m[2] - 1, +m[3]);
  } else if ((m = text.match(/(\d{1,2})[/月](\d{1,2})(?!\d)/)) && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) {
    date = new Date(base.getFullYear(), m[1] - 1, +m[2]);
    // 年をまたぐ締切（12月に「1/10まで」と書いた場合など）
    if (date < addDays(base, -60)) date.setFullYear(date.getFullYear() + 1);
  } else if (/明後日|あさって/.test(text)) {
    date = addDays(base, 2);
  } else if (/明日|あした/.test(text)) {
    date = addDays(base, 1);
  } else if (/今日|本日|当日中/.test(text)) {
    date = new Date(base);
  } else if ((m = text.match(/(\d+)\s*日後/))) {
    date = addDays(base, +m[1]);
  } else if ((m = text.match(/(\d+)\s*週間後/))) {
    date = addDays(base, 7 * m[1]);
  } else if ((m = text.match(/来週の?([月火水木金土日])曜/))) {
    const nextMonday = addDays(base, 7 - dayIndex(base));
    date = addDays(nextMonday, WEEKDAY_CHARS.indexOf(m[1]));
  } else if ((m = text.match(/([月火水木金土日])曜日?(?:まで|締切|〆切|中に)/))) {
    const target = WEEKDAY_CHARS.indexOf(m[1]);
    for (let i = 1; i <= 7; i++) {
      if (dayIndex(addDays(base, i)) === target) {
        date = addDays(base, i);
        break;
      }
    }
  } else if (course && /次回|次の授業|次週|来週の授業/.test(text)) {
    date = nextClassDate(course, base);
  } else if (/来週/.test(text)) {
    date = addDays(base, 7);
  }

  if (!date || isNaN(date)) return null;

  let time = "23:59";
  if ((m = text.match(/(\d{1,2}):(\d{2})/)) && +m[1] < 24 && +m[2] < 60) {
    time = `${pad(m[1])}:${m[2]}`;
  } else if ((m = text.match(/(\d{1,2})時(?!限|間)(?:(\d{1,2})分)?/)) && +m[1] < 24) {
    time = `${pad(m[1])}:${pad(m[2] || 0)}`;
  } else if (course && /次回|次の授業|次週|来週の授業/.test(text)) {
    time = periodTime(course.period)[0] || time;
  }

  return { date: toDateStr(date), time };
}

function shorten(line) {
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

// 授業メモの中から「課題 + 締切」が書かれた行を探して課題として登録する
function registerTasksFromMemo(session, course) {
  const added = [];
  session.memo.split(/\r?\n/).forEach((raw) => {
    const line = cleanLine(raw);
    if (!line || !TASK_KEYWORDS.test(line)) return;
    const deadline = parseDeadline(line, parseDate(session.date), course);
    if (!deadline || isPast(deadline.date)) return;
    const task = addTask({
      courseId: course.id,
      content: shorten(line),
      dueDate: deadline.date,
      dueTime: deadline.time,
      source: "memo",
      sessionId: session.id,
      autoKey: `memo:${session.id}:${line}`,
    });
    if (task) added.push(task);
  });
  return added;
}

// 「毎回の課題」を設定した授業は、授業日が来るたびに課題を自動で追加する
function generateRecurringTasks() {
  const added = [];
  let end = today();
  if (settings.termEnd && parseDate(settings.termEnd) < end) end = parseDate(settings.termEnd);

  courses.forEach((course) => {
    const r = course.recurring;
    if (!r || !r.enabled || !r.title || !r.since) return;

    classDatesBetween(course, parseDate(r.since), end).forEach((d) => {
      const classDate = toDateStr(d);
      const due = r.mode === "days" ? addDays(d, Number(r.days) || 0) : nextClassDate(course, d);
      const dueTime = r.mode === "days" ? "23:59" : periodTime(course.period)[0] || "23:59";
      const autoKey = `rec:${course.id}:${classDate}`;
      if (isPast(toDateStr(due))) {
        autoKeys.add(autoKey);
        return;
      }
      const task = addTask({
        courseId: course.id,
        content: `${r.title}（第${sessionNumberFor(course, classDate)}回 ${formatDate(classDate)}分）`,
        dueDate: toDateStr(due),
        dueTime,
        source: "recurring",
        autoKey,
      });
      if (task) added.push(task);
    });
  });

  saveAutoKeys();
  if (added.length) saveTasks();
  return added;
}

function detectCourse(line) {
  return courses
    .filter((c) => c.name && line.includes(c.name))
    .sort((a, b) => b.name.length - a.name.length)[0] || null;
}

// ---------- リマインド ----------

function checkReminders() {
  const now = new Date();
  const fired = [];

  tasks.forEach((task) => {
    if (task.done) return;
    task.notified = task.notified || [];
    const left = daysLeft(task);
    const thresholds = [...settings.reminderDays, -1].filter((d) => left <= d && !task.notified.includes(d));
    // 当日は締切3時間前にもう一度知らせる
    if (left === 0 && dueDateTime(task) - now <= 3 * 3600000 && !task.notified.includes("3h")) thresholds.push("3h");
    if (!thresholds.length) return;
    task.notified.push(...thresholds);
    fired.push(task);
  });

  if (!fired.length) return;
  saveTasks();
  fired.sort(byDue).forEach(sendNotification);
  const first = fired[0];
  showToast(
    fired.length === 1
      ? `リマインド: ${taskCourseName(first)}「${first.content}」は${getUrgency(first.dueDate).label}です`
      : `リマインド: 締切が近い課題が${fired.length}件あります`,
  );
}

function sendNotification(task) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(`【${getUrgency(task.dueDate).label}】${taskCourseName(task)}`, {
      body: `${task.content}\n締切: ${formatDate(task.dueDate)} ${task.dueTime || ""}`,
      tag: task.id,
    });
  } catch {
    // スマホのブラウザなど、ページから直接通知を出せない環境ではアプリ内表示のみ
  }
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("このブラウザは通知に対応していません");
    return;
  }
  const permission = await Notification.requestPermission();
  updateNotifyButtons();
  showToast(permission === "granted" ? "通知をオンにしました" : "通知が許可されませんでした");
}

function updateNotifyButtons() {
  const show = !IN_FRAME && "Notification" in window && Notification.permission === "default";
  document.querySelectorAll(".notify-btn").forEach((btn) => (btn.hidden = !show));
}

// Googleカレンダーの予定作成画面へのリンク（カレンダー側の通知で、アプリを閉じていてもリマインドされる）
function calendarUrl(task) {
  const end = dueDateTime(task);
  const start = new Date(end - 30 * 60000);
  const fmt = (d) => `${toDateStr(d).replace(/-/g, "")}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `【締切】${taskCourseName(task)} ${task.content}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: "時間割・課題管理アプリから追加",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function icsEscape(str) {
  return str.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
}

// 未完了の課題をアラーム付きでカレンダー形式に書き出す（アプリを閉じていてもスマホでリマインドされる）
function exportIcs() {
  const open = tasks.filter((t) => !t.done).sort(byDue);
  if (!open.length) {
    showToast("書き出す未完了の課題がありません");
    return;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//timetable-app//JA", "CALSCALE:GREGORIAN"];
  open.forEach((t) => {
    const start = `${t.dueDate.replace(/-/g, "")}T${(t.dueTime || "23:59").replace(":", "")}00`;
    const summary = icsEscape(`【締切】${taskCourseName(t)} ${t.content}`);
    lines.push("BEGIN:VEVENT", `UID:${t.id}@timetable-app`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, `DTEND:${start}`, `SUMMARY:${summary}`);
    settings.reminderDays.forEach((d) => {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${summary}`, `TRIGGER:${d === 0 ? "-PT3H" : `-P${d}D`}`, "END:VALARM");
    });
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "assignments.ics";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`${open.length}件の課題を書き出しました`);
}

// ---------- 表示 ----------

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const absenceCount = (courseId) => sessions.filter((s) => s.courseId === courseId && s.attendance === "absent").length;

function renderTimetable() {
  const dayCount = settings.showSaturday ? 6 : 5;
  const todayIdx = dayIndex(today());

  let html = `<thead><tr><th class="corner"></th>`;
  for (let d = 0; d < dayCount; d++) html += `<th class="${d === todayIdx ? "is-today" : ""}">${DAYS[d]}</th>`;
  html += "</tr></thead><tbody>";

  for (let p = 1; p <= settings.periodCount; p++) {
    const [start, end] = periodTime(p);
    html += `<tr><th class="period-head"><span class="period-num">${p}</span><span class="period-time">${start}<br>${end}</span></th>`;
    for (let d = 0; d < dayCount; d++) {
      const course = courses.find((c) => c.day === d && c.period === p);
      const todayClass = d === todayIdx ? "is-today" : "";
      if (!course) {
        html += `<td class="${todayClass}"><button class="empty-cell" data-day="${d}" data-period="${p}" aria-label="${DAYS[d]}曜${p}限に授業を追加">＋</button></td>`;
        continue;
      }
      const open = tasks.filter((t) => !t.done && t.courseId === course.id).length;
      const absences = absenceCount(course.id);
      const limit = Number(course.absenceLimit) || 0;
      const absWarn = limit && absences >= limit - 1;
      html += `<td class="${todayClass}">
        <button class="course-cell course--${course.color || COLORS[0]}" data-open-course="${course.id}">
          <span class="cell-name">${escapeHtml(course.name)}</span>
          ${course.room ? `<span class="cell-room">${escapeHtml(course.room)}</span>` : ""}
          <span class="cell-badges">
            ${open ? `<span class="badge badge--task">課題${open}</span>` : ""}
            ${absences ? `<span class="badge ${absWarn ? "badge--warn" : ""}">欠${absences}</span>` : ""}
          </span>
        </button>
      </td>`;
    }
    html += "</tr>";
  }
  timetableEl.innerHTML = `${html}</tbody>`;
}

// 今日の授業と締切が近い課題をまとめて一番上に出す
function renderToday() {
  const t = today();
  const todays = courses.filter((c) => c.day === dayIndex(t)).sort((a, b) => a.period - b.period);
  const horizon = Math.max(1, ...settings.reminderDays);
  const upcoming = tasks.filter((x) => !x.done && daysLeft(x) <= horizon).sort(byDue).slice(0, 5);

  const classesHtml = todays.length
    ? todays.map((c) => `
        <button class="today-chip course--${c.color || COLORS[0]}" data-open-course="${c.id}">
          <span class="today-chip-period">${c.period}限 ${periodTime(c.period)[0]}</span>
          <span class="today-chip-name">${escapeHtml(c.name)}</span>
          ${c.room ? `<span class="today-chip-room">${escapeHtml(c.room)}</span>` : ""}
        </button>`).join("")
    : `<p class="muted">今日の授業はありません</p>`;

  const remindersHtml = upcoming.length
    ? `<ul class="reminder-list">${upcoming.map((x) => {
        const u = getUrgency(x.dueDate);
        return `<li class="reminder reminder--${u.level}"><span class="reminder-label">${u.label}</span><span class="reminder-text">${escapeHtml(taskCourseName(x))}・${escapeHtml(x.content)}</span></li>`;
      }).join("")}</ul>`
    : `<p class="muted">締切が近い課題はありません</p>`;

  todayPanel.innerHTML = `
    <div class="today-block">
      <h2 class="block-title">今日の授業 <span class="muted">${formatDate(toDateStr(t))}</span></h2>
      <div class="today-chips">${classesHtml}</div>
    </div>
    <div class="today-block">
      <h2 class="block-title">リマインド</h2>
      ${remindersHtml}
    </div>
  `;
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

function taskItemHtml(task, showCourse = true) {
  const urgency = getUrgency(task.dueDate);
  const source = SOURCE_LABELS[task.source] ? `<span class="source-badge">${SOURCE_LABELS[task.source]}</span>` : "";
  const course = courseById(task.courseId);
  const title = showCourse
    ? course
      ? `<button class="link-btn task-course" data-open-course="${course.id}">${escapeHtml(course.name)}</button>`
      : `<strong>${escapeHtml(taskCourseName(task))}</strong>`
    : "";

  return `
    <li class="task-item ${task.done ? "done" : urgency.level}">
      <input type="checkbox" ${task.done ? "checked" : ""} data-id="${task.id}" class="done-checkbox" aria-label="完了">
      <div class="task-content">
        ${title}
        <span class="task-text">${escapeHtml(task.content)}${source}</span>
        <span class="task-due">締切 ${formatDate(task.dueDate)} ${task.dueTime || ""}${task.done ? "" : ` · <a href="${calendarUrl(task)}" target="_blank" rel="noopener">カレンダーに追加</a>`}</span>
      </div>
      <span class="due-label">${task.done ? "完了" : urgency.label}</span>
      <button class="delete-btn" data-id="${task.id}" title="削除" aria-label="削除">✕</button>
    </li>
  `;
}

function filterTasks(list) {
  return list.filter((task) => {
    if (currentFilter === "active") return !task.done;
    if (currentFilter === "done") return task.done;
    return true;
  });
}

function renderTaskList() {
  // 締切が近い順に並べる
  taskList.innerHTML = filterTasks(tasks).sort(byDue).map((t) => taskItemHtml(t)).join("");
  emptyMessage.hidden = tasks.length > 0;
}

function fillSelect(select, html) {
  const value = select.value;
  select.innerHTML = html;
  if ([...select.options].some((o) => o.value === value)) select.value = value;
}

function courseOptions() {
  return [...courses]
    .sort((a, b) => a.day - b.day || a.period - b.period)
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}（${DAYS[c.day]}${c.period}）</option>`)
    .join("");
}

function renderCourseSelects() {
  fillSelect(taskCourseSelect, `${courseOptions()}<option value="">その他（科目名を入力）</option>`);
  // 授業を登録したら、科目名が未入力の「その他」より授業を優先して選んでおく
  if (!taskCourseSelect.value && !subjectInput.value && courses.length) taskCourseSelect.selectedIndex = 0;
  fillSelect($("import-course"), `<option value="">振り分け先: 自動判定</option>${courseOptions()}`);
  toggleSubjectInput();
}

function toggleSubjectInput() {
  const other = taskCourseSelect.value === "";
  subjectInput.hidden = !other;
  subjectInput.required = other;
}

function renderAll() {
  renderToday();
  renderStats();
  renderTimetable();
  renderTaskList();
  renderCourseSelects();
  if (courseDialog.open && activeCourseId) {
    renderAttendanceSummary();
    renderSessionList();
    renderCourseTasks();
  }
}

// ---------- トースト ----------

function showToast(message, { actionLabel, onAction } = {}) {
  // モーダルを開いているときはその中に出さないと隠れてしまう
  const host = document.querySelector("dialog[open]") || document.body;
  if (toastsEl.parentElement !== host) host.appendChild(toastsEl);

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (actionLabel) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      onAction();
      el.remove();
    });
    el.appendChild(btn);
  }
  toastsEl.appendChild(el);
  setTimeout(() => el.remove(), actionLabel ? 8000 : 4500);
}

// ブラウザ標準の confirm() は埋め込み表示で使えないため、ページ内の確認ダイアログを使う
function askConfirm(message, okLabel = "削除する") {
  const dialog = $("confirm-dialog");
  $("confirm-message").textContent = message;
  $("confirm-ok").textContent = okLabel;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), { once: true });
  });
}

// ---------- 授業の詳細ダイアログ ----------

function activeCourse() {
  return courseById(activeCourseId);
}

function openCourseDialog(course) {
  activeCourseId = course.id || null;
  fillInfoForm(course);
  updateCourseHeader(course);
  document.querySelectorAll(".sheet-tab").forEach((tab) => {
    tab.disabled = !activeCourseId && tab.dataset.tab !== "info";
  });
  setCourseTab("info");
  courseDialog.showModal();
}

function updateCourseHeader(course) {
  $("course-title").textContent = course.name || "授業を追加";
  $("course-slot").textContent = slotLabel(course);
}

function setCourseTab(name) {
  document.querySelectorAll(".sheet-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  courseDialog.querySelectorAll("[data-panel]").forEach((panel) => (panel.hidden = panel.dataset.panel !== name));
  courseDialog.querySelector(".sheet-body").scrollTop = 0;

  if (name === "sessions") {
    resetSessionForm();
    renderAttendanceSummary();
    renderSessionList();
  }
  if (name === "absence") fillAbsenceForm();
  if (name === "tasks") {
    renderCourseTasks();
    fillRecurringForm();
  }
}

// --- 基本情報 ---

function fillInfoForm(course) {
  infoForm.day.innerHTML = DAYS.map((d, i) => `<option value="${i}">${d}曜</option>`).join("");
  infoForm.period.innerHTML = settings.periodTimes.map((_, i) => `<option value="${i + 1}">${i + 1}限</option>`).join("");

  ["name", "room", "credits", "teacher", "teacherEmail", "absenceLimit", "url", "note"].forEach((key) => {
    infoForm[key].value = course[key] ?? "";
  });
  infoForm.day.value = course.day;
  infoForm.period.value = course.period;
  draftColor = course.color || COLORS[0];
  draftGrading = (course.grading || []).map((g) => ({ ...g }));
  if (!draftGrading.length) draftGrading.push({ name: "", weight: "" });

  renderSwatches();
  renderGrading();
  $("delete-course").hidden = !course.id;
  $("course-link").innerHTML = course.url ? `<a href="${escapeHtml(course.url)}" target="_blank" rel="noopener">授業ページを開く ↗</a>` : "";
}

function renderSwatches() {
  $("color-swatches").innerHTML = COLORS.map((c) => `
    <button type="button" class="swatch course--${c} ${c === draftColor ? "selected" : ""}" data-color="${c}" aria-label="${c}" aria-pressed="${c === draftColor}"></button>
  `).join("");
}

function renderGrading() {
  $("grading-rows").innerHTML = draftGrading.map((g, i) => `
    <div class="grading-row">
      <input data-gi="${i}" data-gk="name" value="${escapeHtml(g.name)}" placeholder="項目（例: 期末試験）" aria-label="評価項目">
      <label class="pct"><input type="number" min="0" max="100" data-gi="${i}" data-gk="weight" value="${escapeHtml(g.weight)}" aria-label="割合"><span>%</span></label>
      <button type="button" class="icon-btn small" data-gremove="${i}" aria-label="この項目を削除">✕</button>
    </div>
  `).join("");
  renderGradingSummary();
}

function renderGradingSummary() {
  const items = draftGrading.filter((g) => Number(g.weight) > 0);
  const total = items.reduce((sum, g) => sum + Number(g.weight), 0);
  const totalEl = $("grading-total");
  totalEl.textContent = items.length ? `合計 ${total}%${total === 100 ? "" : "（100%になるよう調整してください）"}` : "";
  totalEl.classList.toggle("warn", items.length > 0 && total !== 100);
  $("grading-bar").innerHTML = items.map((g, i) => `
    <span class="seg course--${COLORS[i % COLORS.length]}" style="flex:${Number(g.weight)}" title="${escapeHtml(g.name)} ${g.weight}%">
      ${Number(g.weight) >= 15 ? `${escapeHtml(g.name)} ${g.weight}%` : ""}
    </span>
  `).join("");
}

function saveInfo(e) {
  e.preventDefault();
  const f = infoForm;
  const day = Number(f.day.value);
  const period = Number(f.period.value);
  const clash = courses.find((c) => c.day === day && c.period === period && c.id !== activeCourseId);
  if (clash) {
    showToast(`${DAYS[day]}曜${period}限には既に「${clash.name}」が登録されています`);
    return;
  }

  const data = {
    name: f.name.value.trim(),
    day,
    period,
    room: f.room.value.trim(),
    credits: f.credits.value,
    teacher: f.teacher.value.trim(),
    teacherEmail: f.teacherEmail.value.trim(),
    absenceLimit: f.absenceLimit.value,
    url: f.url.value.trim(),
    note: f.note.value.trim(),
    color: draftColor,
    grading: draftGrading
      .filter((g) => g.name.trim() || Number(g.weight))
      .map((g) => ({ name: g.name.trim(), weight: Number(g.weight) || 0 })),
  };

  let course = activeCourse();
  if (course) {
    Object.assign(course, data);
  } else {
    course = { id: newId(), recurring: { enabled: false, title: "", mode: "next", days: 6, since: null }, ...data };
    courses.push(course);
    activeCourseId = course.id;
    document.querySelectorAll(".sheet-tab").forEach((tab) => (tab.disabled = false));
    $("delete-course").hidden = false;
  }

  saveCourses();
  updateCourseHeader(course);
  fillInfoForm(course);
  renderAll();
  showToast("保存しました");
}

async function deleteCourse() {
  const course = activeCourse();
  if (!course) return;
  if (!(await askConfirm(`「${course.name}」を削除しますか？\nこの授業の授業メモ・出欠記録・課題もすべて削除されます。`))) return;
  courses = courses.filter((c) => c.id !== course.id);
  sessions = sessions.filter((s) => s.courseId !== course.id);
  tasks = tasks.filter((t) => t.courseId !== course.id);
  saveCourses();
  saveSessions();
  saveTasks();
  courseDialog.close();
  renderAll();
  showToast("授業を削除しました");
}

// --- 授業メモ・出欠 ---

function renderAttendanceSummary() {
  const course = activeCourse();
  const list = sessions.filter((s) => s.courseId === course.id);
  const count = (key) => list.filter((s) => s.attendance === key).length;
  const absent = count("absent");
  const limit = Number(course.absenceLimit) || 0;

  let warning = "";
  if (limit && absent >= limit) warning = `<p class="alert alert--danger">欠席が上限（${limit}回）に達しています。担当の先生に確認しましょう。</p>`;
  else if (limit && absent === limit - 1) warning = `<p class="alert alert--warning">あと1回欠席すると上限（${limit}回）です。</p>`;

  $("attendance-summary").innerHTML = `
    <div class="att-stats">
      <div><span class="att-num">${count("present")}</span><span class="att-label">出席</span></div>
      <div><span class="att-num">${count("late")}</span><span class="att-label">遅刻</span></div>
      <div class="${limit && absent >= limit - 1 ? "is-warn" : ""}"><span class="att-num">${absent}${limit ? `<small>/${limit}</small>` : ""}</span><span class="att-label">欠席${limit ? "（上限）" : ""}</span></div>
    </div>
    ${warning}
  `;
}

function renderSessionList() {
  const course = activeCourse();
  const list = sessions.filter((s) => s.courseId === course.id).sort((a, b) => b.date.localeCompare(a.date));

  $("session-list").innerHTML = list.length
    ? list.map((s) => {
        const linked = tasks.filter((t) => t.sessionId === s.id);
        return `
          <li class="session-item att--${s.attendance}">
            <div class="session-head">
              <span class="session-no">第${s.number}回</span>
              <span class="session-date">${formatDate(s.date)}</span>
              <span class="att-badge">${ATTENDANCE[s.attendance]}</span>
              ${s.contacted ? `<span class="badge">連絡済み</span>` : ""}
              <span class="spacer"></span>
              <button type="button" class="link-btn" data-sedit="${s.id}">編集</button>
              <button type="button" class="link-btn danger" data-sdel="${s.id}">削除</button>
            </div>
            ${s.reason ? `<p class="session-reason">欠席理由: ${escapeHtml(s.reason)}</p>` : ""}
            ${s.memo ? `<p class="session-memo">${escapeHtml(s.memo)}</p>` : ""}
            ${linked.map((t) => `<p class="session-task">→ 課題に登録: ${escapeHtml(t.content)}（${formatDate(t.dueDate)}締切）</p>`).join("")}
          </li>
        `;
      }).join("")
    : `<li class="empty-message">まだ記録がありません。授業ごとにメモと出欠を残しておきましょう。</li>`;
}

function resetSessionForm() {
  const course = activeCourse();
  const date = toDateStr(latestClassDate(course, today()));
  sessionForm.sessionId.value = "";
  sessionForm.date.value = date;
  sessionForm.number.value = sessionNumberFor(course, date);
  sessionForm.attendance.value = "present";
  sessionForm.memo.value = "";
  $("session-cancel").hidden = true;
  sessionForm.querySelector("[type=submit]").textContent = "記録する";
}

function editSession(id) {
  const s = sessions.find((x) => x.id === id);
  sessionForm.sessionId.value = s.id;
  sessionForm.date.value = s.date;
  sessionForm.number.value = s.number;
  sessionForm.attendance.value = s.attendance;
  sessionForm.memo.value = s.memo;
  $("session-cancel").hidden = false;
  sessionForm.querySelector("[type=submit]").textContent = "更新する";
  sessionForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveSession(e) {
  e.preventDefault();
  const course = activeCourse();
  const data = {
    number: Number(sessionForm.number.value),
    date: sessionForm.date.value,
    attendance: sessionForm.attendance.value,
    memo: sessionForm.memo.value.trim(),
  };

  // 同じ日の記録が既にあれば（欠席連絡で作られたものなど）そこにまとめる
  let session = sessions.find((s) => s.id === sessionForm.sessionId.value)
    || sessions.find((s) => s.courseId === course.id && s.date === data.date);
  if (session) {
    Object.assign(session, data);
  } else {
    session = { id: newId(), courseId: course.id, contacted: false, reason: "", ...data };
    sessions.push(session);
  }
  if (session.attendance !== "absent") session.reason = "";
  saveSessions();

  const added = registerTasksFromMemo(session, course);
  saveAutoKeys();
  if (added.length) {
    saveTasks();
    showToast(`メモから課題を${added.length}件自動登録しました`, {
      actionLabel: "取り消す",
      onAction: () => {
        tasks = tasks.filter((t) => !added.includes(t));
        saveTasks();
        renderAll();
      },
    });
  } else {
    showToast("記録しました");
  }

  resetSessionForm();
  renderAll();
}

async function deleteSession(id) {
  if (!(await askConfirm("この授業回の記録を削除しますか？"))) return;
  sessions = sessions.filter((s) => s.id !== id);
  saveSessions();
  renderAll();
}

// --- 欠席連絡 ---

function fillAbsenceForm() {
  const course = activeCourse();
  absenceForm.reason.innerHTML = ABSENCE_REASONS.map((r) => `<option>${r}</option>`).join("");
  absenceForm.date.value = toDateStr(nextClassDate(course, today(), true));
  absenceForm.detail.value = "";
  absenceForm.askMaterials.checked = true;
  updateAbsenceText();
}

function buildAbsenceMail(course, { date, reason, detail, askMaterials }) {
  const name = settings.studentName || "（氏名）";
  const id = settings.studentId || "（学籍番号）";
  const dateJa = formatDateJa(date);
  const subject = `【欠席連絡】${course.name}（${dateJa} ${course.period}限）${settings.studentId} ${settings.studentName}`.trim();
  const lines = [
    course.teacher ? `${course.teacher}先生` : "先生",
    "",
    "いつもお世話になっております。",
    `${course.name}（${DAYS[course.day]}曜${course.period}限）を履修しております、${id} ${name}です。`,
    "",
    `${dateJa}の授業を、${REASON_PHRASES[reason] || reason}のため欠席させていただきたく、ご連絡いたしました。`,
  ];
  if (detail) lines.push(detail);
  if (askMaterials) lines.push("", "当日の配布資料や課題などがございましたら、ご教示いただけますと幸いです。");
  lines.push("", "ご迷惑をおかけし申し訳ございませんが、どうぞよろしくお願いいたします。", "", name, id);
  return { subject, body: lines.join("\n") };
}

function absenceParams() {
  return {
    date: absenceForm.date.value,
    reason: absenceForm.reason.value,
    detail: absenceForm.detail.value.trim(),
    askMaterials: absenceForm.askMaterials.checked,
  };
}

function updateAbsenceText() {
  const course = activeCourse();
  if (!absenceForm.date.value) return;
  const { subject, body } = buildAbsenceMail(course, absenceParams());
  absenceForm.to.value = course.teacherEmail || "";
  absenceForm.subject.value = subject;
  absenceForm.body.value = body;
  $("absence-mail").href = `mailto:${course.teacherEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, "\r\n"))}`;

  const hints = [];
  if (!settings.studentName || !settings.studentId) hints.push("⚙ 設定で氏名・学籍番号を入力すると文面に自動で入ります。");
  if (!course.teacherEmail) hints.push("基本情報に教員のメールアドレスを入れると宛先も自動で入ります。");
  const limit = Number(course.absenceLimit) || 0;
  hints.push(`現在の欠席: ${absenceCount(course.id)}回${limit ? ` / 上限${limit}回` : ""}`);
  $("absence-hint").textContent = hints.join(" ");
}

function recordAbsence() {
  const course = activeCourse();
  const { date, reason } = absenceParams();
  let session = sessions.find((s) => s.courseId === course.id && s.date === date);
  if (!session) {
    session = { id: newId(), courseId: course.id, number: sessionNumberFor(course, date), date, memo: "" };
    sessions.push(session);
  }
  Object.assign(session, { attendance: "absent", contacted: true, reason });
  saveSessions();
  renderAll();
  updateAbsenceText();

  const limit = Number(course.absenceLimit) || 0;
  const count = absenceCount(course.id);
  showToast(`${formatDate(date)}を欠席（連絡済み）として記録しました。欠席${count}回${limit ? ` / 上限${limit}回` : ""}`);
}

// 手直しした本文もメールアプリに渡せるよう、開く直前にリンクを作り直す
function refreshMailLink() {
  const course = activeCourse();
  const subject = encodeURIComponent(absenceForm.subject.value);
  const body = encodeURIComponent(absenceForm.body.value.replace(/\n/g, "\r\n"));
  $("absence-mail").href = `mailto:${course.teacherEmail || ""}?subject=${subject}&body=${body}`;
}

async function copyAbsenceMail() {
  const to = absenceForm.to.value;
  const text = `${to ? `宛先: ${to}\n` : ""}件名: ${absenceForm.subject.value}\n\n${absenceForm.body.value}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("文面をコピーしました。メールやLMSに貼り付けて送信し、送ったら「連絡済みとして記録」を押してください");
  } catch {
    absenceForm.body.select();
    showToast("本文を選択しました。コピーしてメールやLMSに貼り付けてください");
  }
}

function recordAbsenceClick() {
  if (!absenceForm.reportValidity()) return;
  recordAbsence();
}

// --- 授業ごとの課題 ---

function renderCourseTasks() {
  const list = tasks.filter((t) => t.courseId === activeCourseId).sort((a, b) => a.done - b.done || byDue(a, b));
  $("course-task-list").innerHTML = list.map((t) => taskItemHtml(t, false)).join("");
  $("course-task-empty").hidden = list.length > 0;
}

function fillRecurringForm() {
  const r = activeCourse().recurring || {};
  recurringForm.enabled.checked = !!r.enabled;
  recurringForm.title.value = r.title || "";
  recurringForm.mode.value = r.mode || "next";
  recurringForm.days.value = r.days ?? 6;
  toggleRecurringDays();
}

function toggleRecurringDays() {
  $("recurring-days").hidden = recurringForm.mode.value !== "days";
}

function saveRecurring(e) {
  e.preventDefault();
  const course = activeCourse();
  const prev = course.recurring || {};
  const enabled = recurringForm.enabled.checked;
  const title = recurringForm.title.value.trim();
  if (enabled && !title) {
    showToast("課題名を入力してください");
    recurringForm.title.focus();
    return;
  }

  course.recurring = {
    enabled,
    title,
    mode: recurringForm.mode.value,
    days: Number(recurringForm.days.value) || 0,
    // 自動登録はオンにした日以降の授業から始める（過去の分がまとめて登録されないように）
    since: enabled ? (prev.enabled && prev.since) || toDateStr(today()) : null,
  };
  saveCourses();
  const added = generateRecurringTasks();
  renderAll();
  showToast(enabled
    ? `保存しました。毎回の授業日に「${title}」を自動登録します${added.length ? `（${added.length}件登録）` : ""}`
    : "毎回の課題の自動登録をオフにしました");
}

// ---------- お知らせ文からの取り込み ----------

function parseImport() {
  const fallback = courseById($("import-course").value) || null;
  importDrafts = [];
  $("import-text").value.split(/\r?\n/).forEach((raw) => {
    const line = cleanLine(raw);
    if (!line) return;
    const detected = detectCourse(line);
    if (!detected && !TASK_KEYWORDS.test(line)) return;
    const course = detected || fallback;
    const deadline = parseDeadline(line, today(), course);
    if (!deadline) return;
    importDrafts.push({ line, course, ...deadline });
  });

  const preview = $("import-preview");
  if (!importDrafts.length) {
    preview.innerHTML = `<p class="hint">締切を含む課題の行が見つかりませんでした。「10/28まで」「来週金曜まで」のような書き方に対応しています。</p>`;
    return;
  }
  preview.innerHTML = `
    <ul class="import-list">
      ${importDrafts.map((d, i) => `
        <li>
          <label class="check">
            <input type="checkbox" data-import="${i}" checked>
            <span><strong>${d.course ? escapeHtml(d.course.name) : "（授業未設定）"}</strong> ${escapeHtml(shorten(d.line))}
            <span class="muted">— ${formatDate(d.date)} ${d.time}締切</span></span>
          </label>
        </li>`).join("")}
    </ul>
    <button type="button" id="import-commit" class="btn-primary">選択した課題を登録</button>
  `;
}

function commitImport() {
  const checked = [...document.querySelectorAll("[data-import]")].filter((c) => c.checked).map((c) => importDrafts[c.dataset.import]);
  const added = checked
    .map((d) => addTask({
      courseId: d.course?.id ?? null,
      content: shorten(d.line),
      dueDate: d.date,
      dueTime: d.time,
      source: "import",
      autoKey: `import:${d.course?.id ?? ""}:${d.date}:${d.line}`,
    }))
    .filter(Boolean);
  saveTasks();
  saveAutoKeys();
  $("import-text").value = "";
  $("import-preview").innerHTML = "";
  importDrafts = [];
  renderAll();
  const skipped = checked.length - added.length;
  showToast(`${added.length}件の課題を登録しました${skipped ? `（登録済みの${skipped}件はスキップ）` : ""}`);
}

// ---------- 設定 ----------

function openSettings() {
  const f = settingsForm;
  f.studentName.value = settings.studentName;
  f.studentId.value = settings.studentId;
  f.termStart.value = settings.termStart;
  f.termEnd.value = settings.termEnd;
  f.periodCount.value = settings.periodCount;
  f.showSaturday.checked = settings.showSaturday;
  $("period-times").innerHTML = settings.periodTimes.map(([s, e], i) => `
    <div class="period-time-row">
      <span>${i + 1}限</span>
      <input type="time" name="p${i}s" value="${s}" aria-label="${i + 1}限の開始">
      <span>–</span>
      <input type="time" name="p${i}e" value="${e}" aria-label="${i + 1}限の終了">
    </div>
  `).join("");
  $("reminder-days").innerHTML = REMINDER_CHOICES.map((d) => `
    <label class="chip-check"><input type="checkbox" value="${d}" ${settings.reminderDays.includes(d) ? "checked" : ""}><span>${d === 0 ? "当日" : `${d}日前`}</span></label>
  `).join("");
  updateNotifyButtons();
  settingsDialog.showModal();
}

function saveSettingsForm(e) {
  e.preventDefault();
  const f = settingsForm;
  settings = {
    ...settings,
    studentName: f.studentName.value.trim(),
    studentId: f.studentId.value.trim(),
    termStart: f.termStart.value,
    termEnd: f.termEnd.value,
    periodCount: Number(f.periodCount.value),
    showSaturday: f.showSaturday.checked,
    periodTimes: settings.periodTimes.map((_, i) => [f[`p${i}s`].value, f[`p${i}e`].value]),
    reminderDays: [...$("reminder-days").querySelectorAll("input:checked")].map((c) => Number(c.value)),
  };
  saveSettings();
  settingsDialog.close();
  renderAll();
  showToast("設定を保存しました");
}

// ---------- イベント ----------

function handleTaskClick(e) {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains("done-checkbox")) {
    const task = tasks.find((t) => t.id === id);
    task.done = e.target.checked;
    saveTasks();
    renderAll();
  }

  if (e.target.classList.contains("delete-btn")) {
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks();
    renderAll();
  }
}

taskList.addEventListener("click", handleTaskClick);
$("course-task-list").addEventListener("click", handleTaskClick);

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask({
    courseId: taskCourseSelect.value || null,
    subject: taskCourseSelect.value ? "" : subjectInput.value.trim(),
    content: contentInput.value.trim(),
    dueDate: dueDateInput.value,
    dueTime: dueTimeInput.value || "23:59",
  });
  saveTasks();
  renderAll();
  contentInput.value = "";
  dueDateInput.value = "";
  contentInput.focus();
});

taskCourseSelect.addEventListener("change", toggleSubjectInput);

courseTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask({
    courseId: activeCourseId,
    content: courseTaskForm.content.value.trim(),
    dueDate: courseTaskForm.dueDate.value,
    dueTime: courseTaskForm.dueTime.value || "23:59",
  });
  saveTasks();
  courseTaskForm.content.value = "";
  courseTaskForm.dueDate.value = "";
  renderAll();
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTaskList();
  });
});

document.querySelectorAll(".view-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".view-tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${tab.dataset.view}`));
  });
});

// 時間割のマス・今日の授業・課題の授業名から、授業の詳細を開く
document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-open-course]");
  if (opener) {
    const course = courseById(opener.dataset.openCourse);
    if (course) openCourseDialog(course);
    return;
  }
  const empty = e.target.closest(".empty-cell");
  if (empty) openCourseDialog({ day: Number(empty.dataset.day), period: Number(empty.dataset.period) });
});

document.querySelectorAll(".sheet-tab").forEach((tab) => tab.addEventListener("click", () => setCourseTab(tab.dataset.tab)));

[courseDialog, settingsDialog].forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });
});

infoForm.addEventListener("submit", saveInfo);
$("delete-course").addEventListener("click", deleteCourse);

$("color-swatches").addEventListener("click", (e) => {
  const swatch = e.target.closest("[data-color]");
  if (!swatch) return;
  draftColor = swatch.dataset.color;
  renderSwatches();
});

$("grading-rows").addEventListener("input", (e) => {
  const { gi, gk } = e.target.dataset;
  if (gi === undefined) return;
  draftGrading[gi][gk] = e.target.value;
  renderGradingSummary();
});

$("grading-rows").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-gremove]");
  if (!btn) return;
  draftGrading.splice(Number(btn.dataset.gremove), 1);
  renderGrading();
});

$("add-grading").addEventListener("click", () => {
  draftGrading.push({ name: "", weight: "" });
  renderGrading();
  $("grading-rows").querySelector(".grading-row:last-child input").focus();
});

sessionForm.addEventListener("submit", saveSession);
$("session-cancel").addEventListener("click", resetSessionForm);
sessionForm.date.addEventListener("change", () => {
  if (!sessionForm.sessionId.value && sessionForm.date.value) {
    sessionForm.number.value = sessionNumberFor(activeCourse(), sessionForm.date.value);
  }
});

$("session-list").addEventListener("click", (e) => {
  if (e.target.dataset.sedit) editSession(e.target.dataset.sedit);
  if (e.target.dataset.sdel) deleteSession(e.target.dataset.sdel);
});

["date", "reason", "detail", "askMaterials"].forEach((name) => {
  absenceForm[name].addEventListener(name === "detail" ? "input" : "change", updateAbsenceText);
});
$("absence-mail").addEventListener("click", refreshMailLink);
$("absence-copy").addEventListener("click", copyAbsenceMail);
$("absence-record").addEventListener("click", recordAbsenceClick);
$("confirm-dialog").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-confirm]");
  if (btn) $("confirm-dialog").close(btn.dataset.confirm);
  else if (e.target.id === "confirm-dialog") $("confirm-dialog").close("no");
});

recurringForm.addEventListener("submit", saveRecurring);
recurringForm.mode.addEventListener("change", toggleRecurringDays);

$("import-parse").addEventListener("click", parseImport);
$("import-preview").addEventListener("click", (e) => {
  if (e.target.id === "import-commit") commitImport();
});

$("export-ics").addEventListener("click", exportIcs);
document.querySelectorAll(".notify-btn").forEach((btn) => btn.addEventListener("click", enableNotifications));

$("open-settings").addEventListener("click", openSettings);
settingsForm.addEventListener("submit", saveSettingsForm);

// 毎分、毎回の課題の自動登録とリマインドを確認する
function tick() {
  const added = generateRecurringTasks();
  if (added.length) showToast(`毎回の課題を${added.length}件自動登録しました`);
  checkReminders();
  renderAll();
}

updateNotifyButtons();
$("export-ics").hidden = IN_FRAME;
renderAll();

// クラウドのデータを読み込んでから自動登録・リマインドを始める（読み込み前の空の状態で動かないように）
connectRemote().finally(() => {
  tick();
  setInterval(tick, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
});
