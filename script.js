// 支出データは配列として持ち、ブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const STORAGE_KEY = "household-budget";
// 記録チェック・固定費・予算・リマインダーなどの設定
const META_KEY = "household-budget-meta";

// 記録漏れをさかのぼって確認する日数
const CHECK_DAYS = 14;

// カテゴリ名とアイコン
const CATEGORIES = {
  食費: "🍙",
  日用品: "🧴",
  交通費: "🚃",
  住居費: "🏠",
  水道光熱費: "💡",
  通信費: "📱",
  交際費: "🍻",
  "趣味・娯楽": "🎮",
  医療費: "💊",
  その他: "📦",
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 以前のバージョンで記録した収入データは、画面には出さずにそのまま保存し続ける
// (消してしまわないよう、保存時に元に戻す)
const stored = loadJson(STORAGE_KEY, []);
const legacyIncome = stored.filter((e) => e.type === "income");
let entries = stored.filter((e) => e.type !== "income");
let meta = loadMeta();
let viewMonth = startOfMonth(new Date());
let undoSnapshot = null;
// claude.ai で開いたときだけ使える機能 (データの同期と Claude への問い合わせ)
const inViewer = Boolean(window.claude);
let db = null;
let sample = null;
let maxImages = 1;
let toastTimer = null;
let reminderTimer = null;
let idSeq = 0;

const $ = (id) => document.getElementById(id);

const form = $("entry-form");
const dateInput = $("date");
const categorySelect = $("category");
const amountInput = $("amount");
const memoInput = $("memo");
const entryGroups = $("entry-groups");
const emptyMessage = $("empty-message");
const historyCount = $("history-count");
const summaryBox = $("summary");
const monthLabel = $("month-label");
const breakdownList = $("breakdown-list");
const breakdownEmpty = $("breakdown-empty");
const toast = $("toast");
const toastText = $("toast-text");
const undoBtn = $("undo-btn");
const quickForm = $("quick-form");
const quickInput = $("quick-input");
const quickPreview = $("quick-preview");
const checkinBox = $("checkin");
const settings = $("settings");
const budgetForm = $("budget-form");
const budgetInput = $("budget-input");
const recurringForm = $("recurring-form");
const recurringList = $("recurring-list");
const recCategory = $("rec-category");
const reminderTimeInput = $("reminder-time");
const notifyBtn = $("notify-btn");
const notifyStatus = $("notify-status");
const receiptBtn = $("receipt-btn");
const receiptInput = $("receipt-input");
const quickBtn = $("quick-btn");
const aiStatus = $("ai-status");
const aiStatusText = $("ai-status-text");
const aiCancel = $("ai-cancel");
const syncStatus = $("sync-status");

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

/* ---------- 保存と読み込み ---------- */

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境(プライベートモード等)でも画面上の操作は続けられるようにする
  }
}

function loadMeta() {
  const saved = loadJson(META_KEY, null);
  // 初回は、既存の記録のうち最も古い日(なければ今日)から記録チェックを始める
  const earliest = entries.reduce((min, e) => (e.date < min ? e.date : min), toDateStr(new Date()));
  const m = {
    trackingStart: earliest,
    noSpendDays: [],
    recurring: [],
    budget: 0,
    reminder: { time: "21:00", notify: false },
    ...saved,
  };
  // 収入の固定費は以前のバージョンの名残なので、自動記録の対象から外す
  m.recurring = m.recurring.filter((r) => r.type !== "income");
  return m;
}

function save() {
  if (db) {
    queueSync();
    return;
  }
  saveJson(STORAGE_KEY, [...legacyIncome, ...entries]);
  saveJson(META_KEY, meta);
}

// 取り消し用に、操作の直前の状態を覚えておく (直後の状態はトーストを出すときに記録する)
function snapshot() {
  undoSnapshot = { before: JSON.stringify({ entries, meta }), after: null };
}

// その操作で変わった分だけを元に戻す。操作のあとに別の端末や Claude が追加した記録は残す
function undoLastAction() {
  const before = JSON.parse(undoSnapshot.before);
  const after = JSON.parse(undoSnapshot.after);
  const beforeMap = new Map(before.entries.map((e) => [e.id, e]));
  const afterMap = new Map(after.entries.map((e) => [e.id, e]));

  let next = entries.filter((e) => !(afterMap.has(e.id) && !beforeMap.has(e.id)));
  for (const [id, e] of beforeMap) {
    if (!afterMap.has(id)) {
      if (!next.some((x) => x.id === id)) next.push(e);
    } else if (JSON.stringify(afterMap.get(id)) !== JSON.stringify(e)) {
      next = next.map((x) => (x.id === id ? e : x));
    }
  }
  entries = next;
  if (JSON.stringify(before.meta) !== JSON.stringify(after.meta)) meta = before.meta;
}

function newId() {
  // 同じミリ秒に複数件追加しても重ならないよう連番を足す (新しいものほど大きい数値になる)
  return String(Date.now() * 1000 + (idSeq++ % 1000));
}

/* ---------- 日付ユーティリティ ---------- */

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// "YYYY-MM-DD" 形式の文字列を作る (toISOString は UTC になるため使わない)
function toDateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromDateStr(s) {
  return new Date(`${s}T00:00:00`);
}

function monthKey(d) {
  return toDateStr(d).slice(0, 7);
}

function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function shortDate(s) {
  const d = fromDateStr(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

/* ---------- 表示用ヘルパー ---------- */

function iconFor(category) {
  return CATEGORIES[category] ?? "•";
}

function fillCategorySelect(select) {
  select.innerHTML = Object.entries(CATEGORIES)
    .map(([name, icon]) => `<option value="${name}">${icon} ${name}</option>`)
    .join("");
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function total(list) {
  return list.reduce((s, e) => s + e.amount, 0);
}

function entriesOfMonth(d) {
  const key = monthKey(d);
  return entries.filter((e) => e.date.startsWith(key));
}

function closeIcon() {
  return `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

/* ---------- 記録を追加する共通処理 ---------- */

// 固定費のように id が決まっているものは、別の端末ですでに記録済みなら追加しない
function addEntries(list) {
  const now = Date.now();
  list.forEach((e) => {
    if (e.id && entries.some((x) => x.id === e.id)) return;
    entries.push({ id: newId(), type: "expense", createdAt: now, ...e });
  });
}

// 同じ日の中で新しい順に並べるための値 (古いデータには createdAt がないので id から求める)
function orderKey(e) {
  if (e.createdAt) return e.createdAt;
  const n = Number(e.id);
  if (!n) return 0;
  return String(e.id).length >= 16 ? n / 1000 : n;
}

/* ---------- 記録チェック (入れ忘れ防止) ---------- */

// 自分で入力した記録があるか、「支出なし」と確認した日を「記録済み」とみなす
// (固定費の自動記録だけの日は、日々の支出を入れ忘れている可能性があるので含めない)
function isRecorded(dateStr) {
  return meta.noSpendDays.includes(dateStr) || entries.some((e) => e.date === dateStr && !e.recurringId);
}

function unrecordedDays() {
  const today = new Date();
  const days = [];
  for (let i = 1; i <= CHECK_DAYS; i++) {
    const s = toDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
    if (s < meta.trackingStart) break;
    if (!isRecorded(s)) days.push(s);
  }
  return days;
}

// 今日(未記録なら昨日)から何日連続で記録できているか
function streakDays() {
  const today = new Date();
  let i = isRecorded(toDateStr(today)) ? 0 : 1;
  let count = 0;
  for (;; i++) {
    const s = toDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
    if (s < meta.trackingStart || !isRecorded(s)) break;
    count++;
  }
  return count;
}

function markNoSpend(days) {
  snapshot();
  days.forEach((d) => {
    if (!meta.noSpendDays.includes(d)) meta.noSpendDays.push(d);
  });
  // 古い記録は不要なので、直近分だけ残す
  const limit = toDateStr(new Date(Date.now() - 90 * 86400000));
  meta.noSpendDays = meta.noSpendDays.filter((d) => d >= limit);
  save();
  render();
  showToast(days.length === 1 ? `${shortDate(days[0])} を「支出なし」にしました` : `${days.length}日分を「支出なし」にしました`);
}

function isPastReminderTime() {
  const [h, m] = meta.reminder.time.split(":").map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

function renderCheckin() {
  const todayStr = toDateStr(new Date());
  const missing = unrecordedDays();
  const todayDone = isRecorded(todayStr);
  const streak = streakDays();

  const todayLine = todayDone
    ? `<p class="checkin-status is-done"><span class="checkin-mark" aria-hidden="true">✓</span>今日の記録は完了しています</p>`
    : `<div class="checkin-status ${isPastReminderTime() ? "is-alert" : ""}">
        <span class="checkin-mark" aria-hidden="true">!</span>
        <span class="checkin-text">今日の記録はまだです</span>
        <button type="button" class="chip-btn" data-action="input" data-date="${todayStr}">入力する</button>
        <button type="button" class="chip-btn" data-action="nospend" data-date="${todayStr}">今日は支出なし</button>
      </div>`;

  const missingBlock = missing.length
    ? `<div class="missing">
        <p class="missing-title">記録していない日が <strong>${missing.length}日</strong> あります</p>
        <ul class="missing-list">
          ${missing
            .map(
              (d) => `
            <li>
              <span class="missing-date">${shortDate(d)}</span>
              <button type="button" class="chip-btn" data-action="input" data-date="${d}">入力する</button>
              <button type="button" class="chip-btn" data-action="nospend" data-date="${d}">支出なし</button>
            </li>`
            )
            .join("")}
        </ul>
        ${missing.length > 1 ? `<button type="button" class="link-btn" data-action="nospend-all">すべて「支出なし」にする</button>` : ""}
      </div>`
    : "";

  checkinBox.classList.toggle("has-missing", missing.length > 0);
  checkinBox.innerHTML = `
    <div class="checkin-head">
      <h2 class="section-title">記録チェック</h2>
      <span class="streak" title="毎日記録できている日数">🔥 連続 <strong>${streak}</strong> 日</span>
    </div>
    ${todayLine}
    ${missingBlock}
  `;
}

checkinBox.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, date } = btn.dataset;
  if (action === "nospend") markNoSpend([date]);
  if (action === "nospend-all") markNoSpend(unrecordedDays());
  if (action === "input") focusQuickInput(date);
});

// 日付を入れた状態でクイック入力に移動する (今日なら日付は省略)
function focusQuickInput(date) {
  const prefix = date === toDateStr(new Date()) ? "" : `${Number(date.slice(5, 7))}/${Number(date.slice(8))} `;
  quickInput.value = prefix;
  updateQuickPreview();
  quickInput.focus();
  quickInput.scrollIntoView({ block: "center", behavior: "smooth" });
}

/* ---------- 月の予算 ---------- */

budgetForm.addEventListener("submit", (e) => {
  e.preventDefault();
  snapshot();
  meta.budget = Math.max(0, Math.round(Number(budgetInput.value) || 0));
  save();
  render();
  showToast(meta.budget ? `月の予算を ${yen.format(meta.budget)} にしました` : "予算を解除しました");
});

/* ---------- 固定費の自動記録 ---------- */

// 各ルールの「次に記録する月」から今月まで、日付が来ている分を記録する
function applyRecurring() {
  const today = new Date();
  const todayStr = toDateStr(today);
  const current = monthKey(today);
  const added = [];

  meta.recurring.forEach((rule) => {
    let cursor = rule.nextMonth;
    while (cursor <= current) {
      const [y, m] = cursor.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const date = `${cursor}-${String(Math.min(rule.day, lastDay)).padStart(2, "0")}`;
      if (date > todayStr) break;
      // 月ごとに決まった id にして、複数の端末で同時に開いても二重に記録されないようにする
      added.push({ id: `rec-${rule.id}-${cursor}`, date, category: rule.category, amount: rule.amount, memo: rule.memo, recurringId: rule.id });
      cursor = monthKey(new Date(y, m, 1));
    }
    rule.nextMonth = cursor;
  });

  const fresh = added.filter((a) => !entries.some((e) => e.id === a.id));
  if (added.length) {
    addEntries(fresh);
    save();
  }
  return fresh;
}

// 固定費のうち、その月にまだ記録されていない分 (これからの支出) を求める
function plannedForMonth(d) {
  const key = monthKey(d);
  const lastDay = daysInMonth(d);
  return meta.recurring
    .filter((r) => r.nextMonth <= key)
    .map((r) => ({
      id: `rec-${r.id}-${key}`,
      type: "expense",
      date: `${key}-${String(Math.min(r.day, lastDay)).padStart(2, "0")}`,
      category: r.category,
      amount: r.amount,
      memo: r.memo,
      recurringId: r.id,
      planned: true,
    }))
    .filter((p) => !entries.some((e) => e.id === p.id));
}

function renderRecurring() {
  recurringList.innerHTML = meta.recurring.length
    ? [...meta.recurring]
        .sort((a, b) => a.day - b.day)
        .map(
          (r) => `
      <li class="recurring-item">
        <span class="cat-icon" aria-hidden="true">${iconFor(r.category)}</span>
        <div class="entry-content">
          <strong>${escapeHtml(r.memo || r.category)}</strong>
          <span>毎月${r.day}日・${escapeHtml(r.category)}</span>
        </div>
        <span class="entry-amount">${yen.format(r.amount)}</span>
        <button type="button" class="delete-btn is-visible" data-rule="${r.id}" aria-label="${escapeHtml(r.memo || r.category)} の固定費設定を削除">${closeIcon()}</button>
      </li>`
        )
        .join("")
    : `<li class="muted">まだ登録されていません。</li>`;
}

recurringForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = Math.round(Number($("rec-amount").value));
  const day = Math.min(31, Math.max(1, Math.round(Number($("rec-day").value))));
  if (!amount || amount <= 0) return;

  const today = new Date();
  const passed = day <= today.getDate();
  // すでに今月の日付を過ぎている場合、チェックがなければ来月から記録する
  const nextMonth = passed && !$("rec-now").checked ? monthKey(new Date(today.getFullYear(), today.getMonth() + 1, 1)) : monthKey(today);

  snapshot();
  meta.recurring.push({
    id: newId(),
    type: "expense",
    category: recCategory.value,
    amount,
    day,
    memo: $("rec-memo").value.trim(),
    nextMonth,
  });
  const added = applyRecurring();
  save();
  render();
  recurringForm.reset();
  showToast(added.length ? "固定費を登録し、今月分を記録しました" : "固定費を登録しました");
});

recurringList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-rule]");
  if (!btn) return;
  snapshot();
  meta.recurring = meta.recurring.filter((r) => r.id !== btn.dataset.rule);
  save();
  render();
  showToast("固定費の設定を削除しました（記録済みの分は残ります）");
});

/* ---------- リマインダー ---------- */

function renderReminder() {
  reminderTimeInput.value = meta.reminder.time;
  const supported = "Notification" in window;
  const granted = supported && Notification.permission === "granted";
  const on = meta.reminder.notify && granted;

  notifyBtn.textContent = on ? "ブラウザ通知をオフにする" : "ブラウザ通知をオンにする";
  notifyBtn.disabled = !supported;
  notifyStatus.textContent = !supported
    ? "このブラウザは通知に対応していません。"
    : Notification.permission === "denied"
      ? "通知がブロックされています。ブラウザの設定からこのページの通知を許可してください。"
      : on
        ? `毎日 ${meta.reminder.time} に、その日の記録がなければ通知します。`
        : "";
}

function scheduleReminder() {
  clearTimeout(reminderTimer);
  if (!meta.reminder.notify || !("Notification" in window) || Notification.permission !== "granted") return;

  const [h, m] = meta.reminder.time.split(":").map(Number);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  if (next <= now) next.setDate(next.getDate() + 1);

  reminderTimer = setTimeout(() => {
    if (!isRecorded(toDateStr(new Date()))) {
      const n = new Notification("家計簿の記録を忘れていませんか？", {
        body: "今日の支出を記録しましょう。支出がなければ「今日は支出なし」を押してください。",
        tag: "budget-reminder",
      });
      n.onclick = () => {
        window.focus();
        quickInput.focus();
      };
    }
    render();
    scheduleReminder();
  }, next - now);
}

notifyBtn.addEventListener("click", async () => {
  if (meta.reminder.notify && Notification.permission === "granted") {
    meta.reminder.notify = false;
  } else {
    const result = await Notification.requestPermission();
    meta.reminder.notify = result === "granted";
  }
  save();
  renderReminder();
  scheduleReminder();
});

reminderTimeInput.addEventListener("change", () => {
  if (!reminderTimeInput.value) return;
  meta.reminder.time = reminderTimeInput.value;
  save();
  renderReminder();
  renderCheckin();
  scheduleReminder();
});

function appUrl() {
  return location.href.split(/[?#]/)[0];
}

// 毎日決まった時刻にアラームが鳴る予定を .ics ファイルとして書き出す
// (スマホやPCのカレンダーに取り込めば、アプリを閉じていても通知が届く)
async function downloadIcs() {
  const [h, m] = meta.reminder.time.split(":");
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const url = appUrl();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//household-budget//reminder//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:budget-reminder-${Date.now()}@household-budget`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${h}${m}00`,
    "DURATION:PT5M",
    "RRULE:FREQ=DAILY",
    "SUMMARY:家計簿をつける",
    `DESCRIPTION:今日の支出を記録しましょう。\\n${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:家計簿をつける",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const data = lines.join("\r\n");
  // claude.ai 上ではページから直接ダウンロードできないため、downloads 機能で保存してもらう
  if (inViewer) {
    const downloads = await claude.use("downloads");
    if (!downloads) {
      showToast("この表示ではファイルを保存できません");
      return;
    }
    try {
      await downloads.save({ filename: "家計簿リマインダー.ics", data });
    } catch (e) {
      if (e?.code !== "cancelled" && e?.code !== "declined") showToast("カレンダー用ファイルを保存できませんでした");
    }
    return;
  }
  const blob = new Blob([data], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "家計簿リマインダー.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("ics-btn").addEventListener("click", downloadIcs);

/* ---------- クイック入力 ---------- */

function describeEntry(entry) {
  return `${iconFor(entry.category)} ${entry.category} ${yen.format(entry.amount)}`;
}

function updateQuickPreview() {
  const results = parseCommands(quickInput.value);
  quickPreview.innerHTML = results
    .map((r) =>
      r.ok && (!sample || r.matched)
        ? `<span class="preview-chip">
            <span>${escapeHtml(describeEntry(r.entry))}</span>
            <span class="preview-meta">${shortDate(r.entry.date)}${r.entry.memo ? ` · ${escapeHtml(r.entry.memo)}` : ""}</span>
          </span>`
        : sample
          ? `<span class="preview-chip is-ai">「${escapeHtml(r.source)}」は Claude が読み取ります</span>`
          : `<span class="preview-chip is-error">「${escapeHtml(r.source)}」: ${r.errors.join("、")}</span>`
    )
    .join("");
}

function commitEntries(list, prefix = "") {
  snapshot();
  addEntries(list);
  save();
  viewMonth = startOfMonth(fromDateStr(list[0].date));
  resetDateInput();
  render();
  showToast(
    list.length === 1
      ? `${prefix}${describeEntry(list[0])}（${shortDate(list[0].date)}）を追加しました`
      : `${prefix}${list.length}件（合計 ${yen.format(total(list))}）を追加しました`
  );
}

// コマンド文字列を解析して登録する。1件でも解析できないものがあれば何も登録しない
function runCommand(text) {
  const results = parseCommands(text);
  if (!results.length) return null;
  if (results.some((r) => !r.ok)) return { ok: false, results };
  commitEntries(results.map((r) => r.entry));
  return { ok: true, results };
}

quickInput.addEventListener("input", updateQuickPreview);

quickInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    quickInput.value = "";
    updateQuickPreview();
    quickInput.blur();
  }
});

quickForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = quickInput.value.trim();
  if (!text) return;
  // Claude が使えるときは、カテゴリまで確実に読めた入力だけをその場で記録する
  const parsed = parseCommands(text);
  const confident = parsed.length && parsed.every((r) => r.ok && r.matched);
  const result = !sample || confident ? runCommand(text) : null;
  if (result?.ok) {
    quickInput.value = "";
    updateQuickPreview();
    return;
  }
  // 決まった書き方で読めない文章は、Claude に読み取ってもらう
  if (sample) {
    const list = await askClaudeText(text);
    if (list && quickInput.value.trim() === text) {
      quickInput.value = "";
      updateQuickPreview();
    }
    return;
  }
  quickForm.classList.remove("shake");
  void quickForm.offsetWidth;
  quickForm.classList.add("shake");
});

// どこからでも "/" または Ctrl/Cmd+K でクイック入力へ移動する
document.addEventListener("keydown", (e) => {
  const typing = e.target.closest("input, textarea, select, [contenteditable]");
  if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
    e.preventDefault();
    quickInput.focus();
    quickInput.select();
  }
});

// URL の ?add=... で開かれたら、その内容を記録する (スマホのショートカットやブックマーク用)
function handleUrlCommand() {
  const params = new URLSearchParams(location.search);
  const text = params.get("add");
  if (text === null) return;
  history.replaceState(null, "", appUrl() + location.hash);

  const result = runCommand(text);
  if (result && !result.ok) {
    quickInput.value = text;
    updateQuickPreview();
    quickInput.focus();
  } else if (!result) {
    quickInput.focus();
  }
}

$("shortcut-url").textContent = `${appUrl()}?add=ランチ 800`;
$("copy-url-btn").addEventListener("click", async (e) => {
  try {
    await navigator.clipboard.writeText(`${appUrl()}?add=`);
    e.target.textContent = "コピーしました";
  } catch {
    e.target.textContent = "コピーできませんでした";
  }
  setTimeout(() => (e.target.textContent = "コピー"), 2000);
});

/* ---------- Claude による読み取り (claude.ai 上のみ) ---------- */

let aiCtl = null;

function todayLine() {
  const t = new Date();
  return `${toDateStr(t)}（${WEEKDAYS[t.getDay()]}曜日）`;
}

const CATEGORY_LIST = Object.keys(CATEGORIES).join("、");

// Claude の答えは信用しきらず、形をそろえてから記録する
function sanitizeAiEntries(list, source) {
  if (!Array.isArray(list)) return [];
  const today = new Date();
  const todayStr = toDateStr(today);
  const oldest = toDateStr(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  return list
    .map((raw) => {
      const amount = Math.round(Number(String(raw?.amount ?? "").replace(/[^\d.]/g, "")));
      if (!amount || amount <= 0 || amount > 10000000) return null;
      let date = String(raw?.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(fromDateStr(date).getTime()) || date > todayStr || date < oldest) date = todayStr;
      const category = CATEGORIES[raw?.category] ? raw.category : "その他";
      const memo = String(raw?.memo ?? "").trim().slice(0, 60);
      return { date, category, amount, memo, ...(source ? { source } : {}) };
    })
    .filter(Boolean);
}

function setAiBusy(label) {
  const busy = Boolean(label);
  aiStatus.hidden = !busy && !aiStatus.classList.contains("is-error");
  if (busy) {
    aiStatus.classList.remove("is-error");
    aiStatus.hidden = false;
    aiStatusText.textContent = label;
    aiCancel.textContent = "中止";
  }
  aiStatus.classList.toggle("is-busy", busy);
  quickBtn.disabled = busy;
  receiptBtn.disabled = busy;
}

function showAiError(message) {
  aiStatus.classList.add("is-error");
  aiStatus.classList.remove("is-busy");
  aiStatus.hidden = false;
  aiStatusText.textContent = message;
  aiCancel.textContent = "閉じる";
}

function clearAiError() {
  if (aiStatus.classList.contains("is-error")) {
    aiStatus.classList.remove("is-error");
    aiStatus.hidden = true;
  }
}

function disableClaude(message) {
  sample = null;
  receiptBtn.hidden = true;
  document.querySelectorAll(".ai-only").forEach((el) => (el.hidden = true));
  updateQuickPreview();
  showAiError(message);
}

function handleAiError(e) {
  switch (e?.code) {
    case "cancelled":
      return;
    case "not_granted":
    case "sampling_disabled":
    case "not_declared":
    case "capability_disabled":
    case "capability_removed":
      disableClaude("Claude への読み取りが許可されていないため、この機能をオフにしました。決まった書き方（例: ランチ 800）なら記録できます。");
      return;
    case "images_unavailable":
      receiptBtn.hidden = true;
      showAiError("この表示では写真を送れません。金額を文章で入力してください。");
      return;
    case "image_rejected":
      showAiError("この画像は読み取れませんでした。JPEG・PNG などの写真を選び直してください。");
      return;
    case "rate_limited":
      showAiError("Claude の利用が混み合っているか、上限に達しました。少し時間をおいてからもう一度送ってください。");
      return;
    case "session_expired":
      showAiError("ログインの有効期限が切れました。claude.ai にログインし直してください。");
      return;
    case "refused":
      showAiError("この内容は読み取れませんでした。金額が分かるように書き直してください。");
      return;
    default:
      showAiError("読み取りに失敗しました。もう一度送ってください。");
  }
}

async function runAi(label, prompt, options = {}) {
  aiCtl?.abort();
  const ctl = new AbortController();
  aiCtl = ctl;
  setAiBusy(label);
  try {
    return await sample.json(prompt, { ...options, signal: ctl.signal, cache: false });
  } catch (e) {
    handleAiError(e);
    return null;
  } finally {
    if (aiCtl === ctl) {
      aiCtl = null;
      setAiBusy(null);
    }
  }
}

aiCancel.addEventListener("click", () => {
  if (aiCtl) aiCtl.abort();
  else clearAiError();
});

async function askClaudeText(text) {
  const prompt = `あなたは支出管理アプリの入力係です。次の文章に書かれた「お金を払った出来事」をすべて抜き出してください。

今日: ${todayLine()}
カテゴリ（必ずこの中から1つ）: ${CATEGORY_LIST}

ルール:
- amount は支払った金額（円、整数）。「1.2万」「3k」なども円に直す。
- date は YYYY-MM-DD。書かれていなければ今日。「昨日」「先週の金曜」などは今日から計算する。未来の日付にはしない。
- memo は店名や品名などを20文字以内で。なければ空文字。
- 収入・もらったお金・予定（まだ払っていないもの）は含めない。
- 支出が1つも読み取れなければ entries を空にして、reason に短い理由を書く。

返答は次の形の JSON だけ:
{"entries":[{"date":"2026-01-31","category":"食費","amount":650,"memo":"スタバ"}],"reason":""}

文章:
"""
${text.slice(0, 2000)}
"""`;
  const data = await runAi("Claude が読み取り中…", prompt, { modelTier: "quick" });
  if (!data) return null;
  const list = sanitizeAiEntries(data.entries);
  if (!list.length) {
    showAiError(`支出を読み取れませんでした${data.reason ? `（${String(data.reason).slice(0, 80)}）` : ""}。金額が分かるように書いてください。`);
    return null;
  }
  clearAiError();
  commitEntries(list, "Claude が ");
  return list;
}

async function readReceipts(files) {
  const prompt = `画像は買い物のレシートまたは領収書の写真です（${files.length}枚）。支出管理アプリに記録するため、読み取ってください。

今日: ${todayLine()}
カテゴリ（必ずこの中から1つ）: ${CATEGORY_LIST}

ルール:
- レシート1枚につき1件。同じレシートが複数の写真に写っていれば1件にまとめる。
- amount は実際に支払った合計金額（税込・値引き後。ポイントやクーポンを使った場合は差し引いた後の支払額）。円の整数。
- date はレシートに印字された日付（YYYY-MM-DD）。読めなければ今日。
- memo は店名（20文字以内）。
- category は店の種類と品目から最も近いものを選ぶ。
- レシートでない画像や、金額が読めない画像は entries に入れず、skipped にその理由を書く。

返答は次の形の JSON だけ:
{"entries":[{"date":"2026-01-31","category":"食費","amount":1280,"memo":"セブンイレブン"}],"skipped":[]}`;
  const data = await runAi(`レシート${files.length > 1 ? `${files.length}枚` : ""}を読み取り中…`, prompt, { images: files, modelTier: "default" });
  if (!data) return;
  const list = sanitizeAiEntries(data.entries, "receipt");
  const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
  if (!list.length) {
    showAiError("レシートの金額を読み取れませんでした。明るい場所で、レシート全体が写るように撮り直してください。");
    return;
  }
  clearAiError();
  commitEntries(list, "レシートから ");
  if (skipped) showAiError(`${skipped}枚は読み取れなかったため記録していません。`);
}

receiptBtn.addEventListener("click", () => receiptInput.click());

receiptInput.addEventListener("change", () => {
  const files = [...receiptInput.files];
  receiptInput.value = "";
  if (!files.length || !sample) return;
  if (files.length > maxImages) showToast(`一度に送れるのは${maxImages}枚までです。最初の${maxImages}枚を読み取ります`);
  readReceipts(files.slice(0, maxImages));
});

async function connectClaude() {
  const s = await claude.use("sample");
  if (!s) return;
  sample = s;
  const caps = await s.limits().catch(() => null);
  if (caps?.images) {
    maxImages = caps.images.maxCount || 1;
    receiptInput.accept = caps.images.mediaTypes.join(",");
    receiptBtn.hidden = false;
  }
  document.querySelectorAll(".ai-only").forEach((el) => (el.hidden = false));
  quickInput.placeholder = "ランチ 800 / 昨日スタバで650円 など自由に";
  updateQuickPreview();
}

/* ---------- 端末間の同期 (claude.ai 上のみ) ---------- */

// サーバーに保存済みの内容 (id → JSON)。ここと手元の差分だけを書き込む
const synced = { entries: new Map(), meta: "" };
let serverEntries = [];
let serverMeta = null;
let syncChain = Promise.resolve();
let syncing = 0;
let serverDirty = false;

function normalizeEntry(id, raw) {
  if (!raw || raw.type === "income") return null;
  const amount = Math.round(Number(raw.amount));
  if (!amount || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date))) return null;
  return {
    ...raw,
    id,
    type: "expense",
    date: String(raw.date),
    amount,
    category: CATEGORIES[raw.category] ? raw.category : "その他",
    memo: String(raw.memo ?? "").slice(0, 60),
  };
}

function normalizeMeta(raw) {
  const m = { ...meta, ...(raw || {}) };
  m.noSpendDays = Array.isArray(m.noSpendDays) ? m.noSpendDays : [];
  m.recurring = Array.isArray(m.recurring) ? m.recurring.filter((r) => r.type !== "income") : [];
  m.reminder = { time: "21:00", notify: false, ...(m.reminder || {}) };
  m.budget = Number(m.budget) || 0;
  return m;
}

function applyServer() {
  entries = serverEntries.slice();
  synced.entries = new Map(entries.map((e) => [e.id, JSON.stringify(e)]));
  if (serverMeta) {
    meta = normalizeMeta(serverMeta);
    synced.meta = JSON.stringify(meta);
  }
  render();
}

function queueSync() {
  syncing++;
  syncChain = syncChain
    .then(syncToDb)
    .catch(onSyncError)
    .finally(() => {
      syncing--;
      if (!syncing && serverDirty) {
        serverDirty = false;
        applyServer();
      }
    });
  return syncChain;
}

async function syncToDb() {
  const col = db.collection("entries");
  const current = new Map(entries.map((e) => [e.id, JSON.stringify(e)]));
  for (const [id, json] of current) {
    if (synced.entries.get(id) === json) continue;
    await col.doc(id).set(JSON.parse(json));
    synced.entries.set(id, json);
  }
  for (const id of [...synced.entries.keys()]) {
    if (current.has(id)) continue;
    await col.doc(id).delete();
    synced.entries.delete(id);
  }
  const metaJson = JSON.stringify(meta);
  if (metaJson !== synced.meta) {
    await db.doc("meta/settings").set(JSON.parse(metaJson));
    synced.meta = metaJson;
  }
  setSyncStatus("ok");
}

function onSyncError(e) {
  setSyncStatus("error");
  showToast(
    e?.code === "quota_exceeded"
      ? "保存できる件数の上限に達しました。古い記録を削除してください"
      : e?.code === "invalid_argument"
        ? "この表示では変更を保存できません（閲覧のみの権限です）"
        : "保存に失敗しました。通信状態を確認して、もう一度操作してください"
  );
}

function setSyncStatus(state) {
  syncStatus.textContent =
    state === "ok"
      ? "✓ この記録は claude.ai に保存され、PC とスマホで同期されています。"
      : state === "error"
        ? "保存に失敗した変更があります。通信状態を確認してください。"
        : "同期の準備中です…";
}

// 最初に確定した内容が届いたら、同期に切り替える
// (切り替え前にこの端末だけで記録したものがあれば、サーバーにも保存する)
function goOnline(store) {
  const localEntries = entries;
  const localMeta = meta;
  db = store;
  applyServer();
  const ids = new Set(entries.map((e) => e.id));
  const extra = localEntries.filter((e) => !ids.has(e.id));
  if (extra.length) entries.push(...extra);
  if (!serverMeta) meta = localMeta;
  queueSync().then(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(META_KEY);
    } catch {
      // 消せなくても同期には影響しない
    }
  });
  const added = applyRecurring();
  render();
  if (added.length) showToast(`固定費を${added.length}件、自動で記録しました`);
}

async function connectDb() {
  const store = await claude.use("db");
  if (!store) return;
  setSyncStatus("pending");
  let gotEntries = false;
  let gotMeta = false;

  const onChange = () => {
    if (!db) {
      if (gotEntries && gotMeta) goOnline(store);
      return;
    }
    if (syncing) serverDirty = true;
    else applyServer();
  };
  const onError = () => setSyncStatus("error");

  store.collection("entries").onSnapshot((snap) => {
    serverEntries = snap.docs.map((d) => normalizeEntry(d.id, d.data())).filter(Boolean);
    if (!snap.metadata.fromCache) gotEntries = true;
    onChange();
  }, onError);
  store.doc("meta/settings").onSnapshot((snap) => {
    serverMeta = snap.exists ? snap.data() : null;
    if (!snap.metadata.fromCache) gotMeta = true;
    onChange();
  }, onError);
}

/* ---------- 詳細フォーム ---------- */

// 表示中の月が今月なら今日、それ以外はその月の1日を初期値にする
function resetDateInput() {
  const today = new Date();
  dateInput.value = monthKey(today) === monthKey(viewMonth) ? toDateStr(today) : toDateStr(viewMonth);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const amount = Math.round(Number(amountInput.value));
  if (!amount || amount <= 0) return;

  snapshot();
  addEntries([{ date: dateInput.value, category: categorySelect.value, amount, memo: memoInput.value.trim() }]);
  save();

  // 登録した日付の月へ移動して、追加結果がすぐ見えるようにする
  viewMonth = startOfMonth(fromDateStr(dateInput.value));
  amountInput.value = "";
  memoInput.value = "";
  render();
  amountInput.focus();
});

/* ---------- 月の表示 ---------- */

// 月の合計に加え、予算があれば残り金額を、なければ前月との比較を出す
function renderSummary(monthEntries, planned) {
  const today = new Date();
  const isCurrent = monthKey(viewMonth) === monthKey(today);
  const isFuture = viewMonth > today;
  const spent = total(monthEntries);
  const plannedSum = total(planned);
  const prevSpent = total(entriesOfMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)));
  const elapsedDays = isCurrent ? today.getDate() : isFuture ? 0 : daysInMonth(viewMonth);
  const dailyAvg = elapsedDays ? Math.round(spent / elapsedDays) : 0;

  let budgetBlock;
  if (meta.budget > 0) {
    const pct = Math.round((spent / meta.budget) * 100);
    const remaining = meta.budget - spent;
    const daysLeft = isCurrent ? daysInMonth(today) - today.getDate() + 1 : 0;
    let note;
    if (remaining < 0) note = `予算を <strong class="is-over">${yen.format(-remaining)}</strong> 超えています`;
    else if (isCurrent) note = `残り <strong>${yen.format(remaining)}</strong>・1日あたり ${yen.format(Math.floor(remaining / daysLeft))} まで`;
    else note = `残り <strong>${yen.format(remaining)}</strong>`;

    // 使った分に続けて、これから引き落とされる固定費を斜線で示す
    const usedWidth = Math.min(100, (spent / meta.budget) * 100);
    const planWidth = Math.min(100 - usedWidth, (plannedSum / meta.budget) * 100);
    budgetBlock = `
      <div class="meter ${pct >= 100 ? "is-over" : pct >= 80 ? "is-warn" : ""}" role="img" aria-label="予算の${pct}%を使用${plannedSum ? `、ほかに固定費の予定 ${yen.format(plannedSum)}` : ""}">
        <span class="meter-used" style="width:${usedWidth}%"></span>
        ${planWidth > 0 ? `<span class="meter-plan" style="width:${planWidth}%"></span>` : ""}
      </div>
      <p class="meter-note"><span>${note}</span><span>予算 ${yen.format(meta.budget)} の ${pct}%</span></p>`;
  } else {
    budgetBlock = `<p class="meter-note"><button type="button" class="link-btn" id="set-budget-btn">月の予算を設定する</button></p>`;
  }

  const planLine = plannedSum
    ? `<p class="plan-line"><span class="legend-swatch is-plan" aria-hidden="true"></span>固定費の予定 <strong>${yen.format(plannedSum)}</strong>（${planned.length}件）を含めると <strong>${yen.format(spent + plannedSum)}</strong></p>`
    : "";

  let compare = "—";
  if (prevSpent > 0) {
    const diff = spent - prevSpent;
    compare = `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${yen.format(Math.abs(diff))}`;
  }

  summaryBox.innerHTML = `
    <p class="summary-label">${isCurrent ? "今月の支出" : `${viewMonth.getMonth() + 1}月の支出`}</p>
    <p class="summary-balance">${yen.format(spent)}</p>
    ${budgetBlock}
    ${planLine}
    <dl class="summary-split">
      <div>
        <dt>1日平均</dt>
        <dd>${yen.format(dailyAvg)}</dd>
      </div>
      <div>
        <dt>前月との差</dt>
        <dd class="${prevSpent > 0 && spent > prevSpent ? "is-up" : ""}">${compare}</dd>
      </div>
    </dl>
  `;
  $("set-budget-btn")?.addEventListener("click", () => {
    settings.open = true;
    budgetInput.focus();
    budgetInput.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

// カテゴリ別の支出を多い順に並べ、割合を横棒で表示する
function renderBreakdown(monthEntries) {
  const totals = {};
  monthEntries.forEach((e) => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });

  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const sum = rows.reduce((s, [, v]) => s + v, 0);
  const max = rows.length ? rows[0][1] : 0;

  breakdownEmpty.hidden = rows.length > 0;
  breakdownList.innerHTML = rows
    .map(
      ([cat, value]) => `
        <li class="breakdown-row">
          <span class="cat-icon" aria-hidden="true">${iconFor(cat)}</span>
          <div class="breakdown-main">
            <div class="breakdown-top">
              <span class="breakdown-cat">${escapeHtml(cat)}</span>
              <span class="breakdown-val">${yen.format(value)}<small>${Math.round((value / sum) * 100)}%</small></span>
            </div>
            <span class="breakdown-bar"><span style="width:${(value / max) * 100}%"></span></span>
          </div>
        </li>
      `
    )
    .join("");
}

// カレンダーのマスに収まるよう、金額を短く表す (例: 3,400 / 1.2万)
function compactYen(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "")}万`;
  return n.toLocaleString("ja-JP");
}

function sumByDate(list) {
  const map = {};
  list.forEach((e) => {
    map[e.date] = (map[e.date] || 0) + e.amount;
  });
  return map;
}

// 月のカレンダー。過去と今日は支出の合計を濃淡で、未来は固定費の予定を点線の枠で示す
function renderCalendar(monthEntries, planned) {
  const actual = sumByDate(monthEntries);
  const plan = sumByDate(planned);
  const max = Math.max(1, ...Object.values(actual));
  const todayStr = toDateStr(new Date());
  const missing = new Set(unrecordedDays());
  const key = monthKey(viewMonth);
  const days = daysInMonth(viewMonth);

  const cells = [];
  for (let i = 0; i < viewMonth.getDay(); i++) cells.push(`<span class="cal-cell is-blank" aria-hidden="true"></span>`);
  for (let day = 1; day <= days; day++) {
    const date = `${key}-${String(day).padStart(2, "0")}`;
    const spent = actual[date] || 0;
    const planAmt = plan[date] || 0;
    const dow = (viewMonth.getDay() + day - 1) % 7;
    // 支出額を 1〜4 の段階に分けて、マスの色の濃さにする
    const level = spent ? Math.max(1, Math.ceil((spent / max) * 4)) : 0;
    const classes = [
      "cal-cell",
      `wd-${dow}`,
      date === todayStr && "is-today",
      date > todayStr && "is-future",
      planAmt && "has-plan",
      missing.has(date) && "is-missing",
      meta.noSpendDays.includes(date) && !spent && "is-nospend",
    ].filter(Boolean);
    const label = [
      `${viewMonth.getMonth() + 1}月${day}日`,
      spent ? `支出 ${yen.format(spent)}` : "",
      planAmt ? `予定 ${yen.format(planAmt)}` : "",
      missing.has(date) ? "未記録" : "",
    ]
      .filter(Boolean)
      .join("、");
    cells.push(`
      <button type="button" class="${classes.join(" ")}" data-date="${date}" data-level="${level}" aria-label="${label}">
        <span class="cal-day">${day}</span>
        ${spent ? `<span class="cal-amt">${compactYen(spent)}</span>` : ""}
        ${planAmt ? `<span class="cal-plan">${compactYen(planAmt)}</span>` : ""}
        ${meta.noSpendDays.includes(date) && !spent ? `<span class="cal-zero">0</span>` : ""}
      </button>`);
  }
  $("cal-grid").innerHTML = cells.join("");

  const spentSum = total(monthEntries);
  const planSum = total(planned);
  $("cal-totals").innerHTML = `<span>支出 <strong>${yen.format(spentSum)}</strong></span>${
    planSum ? `<span class="cal-totals-plan">予定 <strong>${yen.format(planSum)}</strong></span>` : ""
  }`;
}

$("cal-grid").addEventListener("click", (e) => {
  const cell = e.target.closest(".cal-cell[data-date]");
  if (!cell) return;
  const { date } = cell.dataset;
  const group = document.getElementById(`day-${date}`);
  if (group) {
    group.scrollIntoView({ block: "start", behavior: "smooth" });
    group.classList.remove("is-flash");
    void group.offsetWidth;
    group.classList.add("is-flash");
  } else if (date <= toDateStr(new Date())) {
    focusQuickInput(date);
  } else {
    showToast(`${shortDate(date)} の予定はありません`);
  }
});

// 並び順 (古い順／新しい順) は、この端末だけの表示設定として覚えておく
const SORT_KEY = "household-budget-sort";
let sortAsc = loadJson(SORT_KEY, true) !== false;
const sortBtn = $("sort-btn");

function renderSortButton() {
  sortBtn.textContent = sortAsc ? "日付：古い順 ↓" : "日付：新しい順 ↓";
  sortBtn.setAttribute("aria-label", sortAsc ? "並び順：古い日付から。押すと新しい日付からに切り替え" : "並び順：新しい日付から。押すと古い日付からに切り替え");
}

sortBtn.addEventListener("click", () => {
  sortAsc = !sortAsc;
  saveJson(SORT_KEY, sortAsc);
  render();
});

// 記録済みの支出と固定費の予定をまとめて日付順に並べ、日ごとの見出しに合計を出す
function renderList(monthEntries, planned) {
  const dir = sortAsc ? 1 : -1;
  const sorted = [...monthEntries, ...planned].sort(
    (a, b) => dir * a.date.localeCompare(b.date) || Number(Boolean(a.planned)) - Number(Boolean(b.planned)) || dir * (orderKey(a) - orderKey(b))
  );

  const groups = new Map();
  sorted.forEach((e) => {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  });

  historyCount.textContent = [monthEntries.length ? `${monthEntries.length}件` : "", planned.length ? `予定${planned.length}件` : ""]
    .filter(Boolean)
    .join("・");
  emptyMessage.hidden = sorted.length > 0;
  renderSortButton();

  const todayStr = toDateStr(new Date());
  entryGroups.innerHTML = [...groups]
    .map(([date, items]) => {
      const d = fromDateStr(date);
      const done = items.filter((e) => !e.planned);
      const upcoming = items.filter((e) => e.planned);
      return `
        <section class="day-group ${done.length ? "" : "is-planned"}" id="day-${date}">
          <h3 class="day-head">
            <span>${d.getMonth() + 1}月${d.getDate()}日<span class="weekday wd-${d.getDay()}">（${WEEKDAYS[d.getDay()]}）</span>${date === todayStr ? '<span class="today-badge">今日</span>' : ""}</span>
            <span class="day-total">${done.length ? yen.format(total(done)) : ""}${upcoming.length ? `<span class="day-plan">予定 ${yen.format(total(upcoming))}</span>` : ""}</span>
          </h3>
          <ul class="entry-list">
            ${items.map(renderItem).join("")}
          </ul>
        </section>
      `;
    })
    .join("");
}

function renderItem(entry) {
  if (entry.planned) {
    return `
    <li class="entry-item is-planned">
      <span class="cat-icon" aria-hidden="true">${iconFor(entry.category)}</span>
      <div class="entry-content">
        <strong>${escapeHtml(entry.memo || entry.category)}<span class="tag tag--plan">予定</span></strong>
        <span>${escapeHtml(entry.category)}・固定費（この日に自動で記録）</span>
      </div>
      <span class="entry-amount">${yen.format(entry.amount)}</span>
      <span class="delete-spacer" aria-hidden="true"></span>
    </li>`;
  }
  return `
    <li class="entry-item">
      <span class="cat-icon" aria-hidden="true">${iconFor(entry.category)}</span>
      <div class="entry-content">
        <strong>${escapeHtml(entry.category)}${entry.recurringId ? '<span class="tag">固定費</span>' : ""}${entry.source === "receipt" ? '<span class="tag">レシート</span>' : ""}</strong>
        ${entry.memo ? `<span>${escapeHtml(entry.memo)}</span>` : ""}
      </div>
      <span class="entry-amount">${yen.format(entry.amount)}</span>
      <button class="delete-btn" data-id="${entry.id}" aria-label="${escapeHtml(entry.category)} ${yen.format(entry.amount)} を削除">${closeIcon()}</button>
    </li>
  `;
}

function render() {
  monthLabel.textContent = `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`;
  const monthEntries = entriesOfMonth(viewMonth);
  const planned = plannedForMonth(viewMonth);
  renderCalendar(monthEntries, planned);
  renderCheckin();
  renderSummary(monthEntries, planned);
  renderBreakdown(monthEntries);
  renderList(monthEntries, planned);
  renderRecurring();
  renderReminder();
  if (document.activeElement !== budgetInput) budgetInput.value = meta.budget || "";
}

function goToMonth(d) {
  viewMonth = startOfMonth(d);
  resetDateInput();
  render();
}

/* ---------- トーストと取り消し ---------- */

// 直前に snapshot() した操作の結果を知らせるときだけ「元に戻す」を出す
function showToast(message) {
  if (undoSnapshot && undoSnapshot.after === null) undoSnapshot.after = JSON.stringify({ entries, meta });
  else undoSnapshot = null;
  toastText.textContent = message;
  undoBtn.hidden = !undoSnapshot;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  toast.classList.remove("is-visible");
  undoSnapshot = null;
  setTimeout(() => {
    if (!toast.classList.contains("is-visible")) toast.hidden = true;
  }, 250);
}

undoBtn.addEventListener("click", () => {
  if (!undoSnapshot?.after) return;
  undoLastAction();
  save();
  render();
  scheduleReminder();
  hideToast();
});

entryGroups.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  const entry = entries.find((en) => en.id === btn.dataset.id);
  if (!entry) return;
  snapshot();
  entries = entries.filter((en) => en !== entry);
  save();
  render();
  showToast(`「${entry.category}」を削除しました`);
});

$("prev-month").addEventListener("click", () => goToMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)));
$("next-month").addEventListener("click", () => goToMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)));
monthLabel.addEventListener("click", () => goToMonth(new Date()));

// 日付が変わったときや、タブに戻ってきたときに記録チェックを最新にする
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if ((!inViewer || db) && applyRecurring().length) showToast("固定費を自動で記録しました");
    render();
  }
});

/* ---------- 起動 ---------- */

fillCategorySelect(categorySelect);
fillCategorySelect(recCategory);
resetDateInput();
document.querySelectorAll(".local-only").forEach((el) => (el.hidden = inViewer));
document.querySelectorAll(".viewer-only").forEach((el) => (el.hidden = !inViewer));

if (inViewer) {
  // claude.ai 上では、サーバーのデータが届いてから固定費などを処理する
  render();
  connectDb();
  connectClaude();
} else {
  save();
  const autoAdded = applyRecurring();
  render();
  scheduleReminder();
  handleUrlCommand();
  if (autoAdded.length && toast.hidden) showToast(`固定費を${autoAdded.length}件、自動で記録しました`);
}
