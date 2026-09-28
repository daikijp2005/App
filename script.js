// 収支データは配列として持ち、ブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const STORAGE_KEY = "household-budget";
// 記録チェック・固定費・リマインダーなどの設定
const META_KEY = "household-budget-meta";

// 記録漏れをさかのぼって確認する日数
const CHECK_DAYS = 14;

// カテゴリ名とアイコン。「その他」は収入・支出の両方にあるため種類ごとに分けて持つ
const CATEGORIES = {
  expense: {
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
  },
  income: {
    給与: "💼",
    アルバイト: "🕒",
    仕送り: "✉️",
    臨時収入: "🎁",
    その他: "💰",
  },
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

let entries = loadJson(STORAGE_KEY, []);
let meta = loadMeta();
let currentFilter = "all";
let viewMonth = startOfMonth(new Date());
let undoSnapshot = null;
let toastTimer = null;
let reminderTimer = null;
let idSeq = 0;

const $ = (id) => document.getElementById(id);

const form = $("entry-form");
const dateInput = $("date");
const categorySelect = $("category");
const amountInput = $("amount");
const memoInput = $("memo");
const submitBtn = $("submit-btn");
const typeRadios = form.querySelectorAll('input[name="type"]');
const entryGroups = $("entry-groups");
const emptyMessage = $("empty-message");
const filterButtons = document.querySelectorAll(".filter-btn");
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
const recurringForm = $("recurring-form");
const recurringList = $("recurring-list");
const recType = $("rec-type");
const recCategory = $("rec-category");
const reminderTimeInput = $("reminder-time");
const notifyBtn = $("notify-btn");
const notifyStatus = $("notify-status");

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

// 符号付きで表示する (ハイフンではなくマイナス記号を使い、表記をそろえる)
function signedYen(value) {
  if (value === 0) return yen.format(0);
  return `${value > 0 ? "+" : "−"}${yen.format(Math.abs(value))}`;
}

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
  return {
    trackingStart: earliest,
    noSpendDays: [],
    recurring: [],
    reminder: { time: "21:00", notify: false },
    ...saved,
  };
}

function save() {
  saveJson(STORAGE_KEY, entries);
  saveJson(META_KEY, meta);
}

// 取り消し用に、変更前の状態を丸ごと覚えておく
function snapshot() {
  undoSnapshot = JSON.stringify({ entries, meta });
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

function shortDate(s) {
  const d = fromDateStr(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

/* ---------- 表示用ヘルパー ---------- */

function iconFor(entry) {
  return CATEGORIES[entry.type]?.[entry.category] ?? "•";
}

function fillCategorySelect(select, type) {
  select.innerHTML = Object.entries(CATEGORIES[type])
    .map(([name, icon]) => `<option value="${name}">${icon} ${name}</option>`)
    .join("");
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function sumOf(list, type) {
  return list.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
}

/* ---------- 記録を追加する共通処理 ---------- */

function addEntries(list) {
  list.forEach((e) => entries.push({ id: newId(), ...e }));
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
  if (action === "input") {
    // 日付を入れた状態でクイック入力に移動する (今日なら日付は省略)
    const prefix = date === toDateStr(new Date()) ? "" : `${Number(date.slice(5, 7))}/${Number(date.slice(8))} `;
    quickInput.value = prefix;
    updateQuickPreview();
    quickInput.focus();
    quickInput.scrollIntoView({ block: "center", behavior: "smooth" });
  }
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
      added.push({ type: rule.type, date, category: rule.category, amount: rule.amount, memo: rule.memo, recurringId: rule.id });
      cursor = monthKey(new Date(y, m, 1));
    }
    rule.nextMonth = cursor;
  });

  if (added.length) {
    addEntries(added);
    save();
  }
  return added;
}

function renderRecurring() {
  recurringList.innerHTML = meta.recurring.length
    ? meta.recurring
        .map(
          (r) => `
      <li class="recurring-item ${r.type}">
        <span class="cat-icon" aria-hidden="true">${CATEGORIES[r.type][r.category] ?? "•"}</span>
        <div class="entry-content">
          <strong>${escapeHtml(r.memo || r.category)}</strong>
          <span>毎月${r.day}日・${escapeHtml(r.category)}</span>
        </div>
        <span class="entry-amount">${signedYen(r.type === "income" ? r.amount : -r.amount)}</span>
        <button type="button" class="delete-btn is-visible" data-rule="${r.id}" aria-label="${escapeHtml(r.memo || r.category)} の固定費設定を削除">${closeIcon()}</button>
      </li>`
        )
        .join("")
    : `<li class="muted">まだ登録されていません。</li>`;
}

recType.addEventListener("change", () => fillCategorySelect(recCategory, recType.value));

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
    type: recType.value,
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
  fillCategorySelect(recCategory, recType.value);
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
function downloadIcs() {
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
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "家計簿リマインダー.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("ics-btn").addEventListener("click", downloadIcs);

/* ---------- クイック入力 ---------- */

function describeEntry(entry) {
  return `${iconFor(entry)} ${entry.category} ${signedYen(entry.type === "income" ? entry.amount : -entry.amount)}`;
}

function updateQuickPreview() {
  const results = parseCommands(quickInput.value);
  quickPreview.innerHTML = results
    .map((r) =>
      r.ok
        ? `<span class="preview-chip ${r.entry.type}">
            <span>${escapeHtml(describeEntry(r.entry))}</span>
            <span class="preview-meta">${shortDate(r.entry.date)}${r.entry.memo ? ` · ${escapeHtml(r.entry.memo)}` : ""}</span>
          </span>`
        : `<span class="preview-chip is-error">「${escapeHtml(r.source)}」: ${r.errors.join("、")}</span>`
    )
    .join("");
}

// コマンド文字列を解析して登録する。1件でも解析できないものがあれば何も登録しない
function runCommand(text) {
  const results = parseCommands(text);
  if (!results.length) return null;
  if (results.some((r) => !r.ok)) return { ok: false, results };

  snapshot();
  const list = results.map((r) => r.entry);
  addEntries(list);
  save();
  viewMonth = startOfMonth(fromDateStr(list[0].date));
  resetDateInput();
  render();
  showToast(list.length === 1 ? `${describeEntry(list[0])}（${shortDate(list[0].date)}）を追加しました` : `${list.length}件を追加しました`);
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

quickForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const result = runCommand(quickInput.value);
  if (!result) return;
  if (result.ok) {
    quickInput.value = "";
    updateQuickPreview();
  } else {
    quickForm.classList.remove("shake");
    void quickForm.offsetWidth;
    quickForm.classList.add("shake");
  }
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

/* ---------- 詳細フォーム ---------- */

function getSelectedType() {
  return form.querySelector('input[name="type"]:checked').value;
}

function onTypeChange() {
  const type = getSelectedType();
  fillCategorySelect(categorySelect, type);
  form.dataset.type = type;
  submitBtn.textContent = type === "income" ? "収入を追加" : "支出を追加";
}

// 表示中の月が今月なら今日、それ以外はその月の1日を初期値にする
function resetDateInput() {
  const today = new Date();
  dateInput.value = monthKey(today) === monthKey(viewMonth) ? toDateStr(today) : toDateStr(viewMonth);
}

typeRadios.forEach((r) => r.addEventListener("change", onTypeChange));

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const amount = Math.round(Number(amountInput.value));
  if (!amount || amount <= 0) return;

  snapshot();
  addEntries([
    {
      type: getSelectedType(),
      date: dateInput.value,
      category: categorySelect.value,
      amount,
      memo: memoInput.value.trim(),
    },
  ]);
  save();

  // 登録した日付の月へ移動して、追加結果がすぐ見えるようにする
  viewMonth = startOfMonth(fromDateStr(dateInput.value));
  amountInput.value = "";
  memoInput.value = "";
  render();
  amountInput.focus();
});

/* ---------- 月の表示 ---------- */

function renderSummary(monthEntries, label) {
  const income = sumOf(monthEntries, "income");
  const expense = sumOf(monthEntries, "expense");
  const balance = income - expense;
  // 収入に対して支出がどれだけあるかを 0〜100% のメーターで示す
  const usedPct = income > 0 ? Math.min(100, Math.round((expense / income) * 100)) : expense > 0 ? 100 : 0;
  const meterNote =
    income > 0 ? `収入の ${Math.round((expense / income) * 100)}% を使用` : expense > 0 ? "収入の記録がありません" : "まだ記録がありません";

  summaryBox.innerHTML = `
    <p class="summary-label">${label}</p>
    <p class="summary-balance ${balance < 0 ? "is-negative" : ""}">${signedYen(balance)}</p>
    <div class="meter ${usedPct >= 100 ? "is-over" : ""}" role="img" aria-label="${meterNote}">
      <span style="width:${usedPct}%"></span>
    </div>
    <p class="meter-note">${meterNote}</p>
    <dl class="summary-split">
      <div>
        <dt><span class="dot dot--income"></span>収入</dt>
        <dd>${yen.format(income)}</dd>
      </div>
      <div>
        <dt><span class="dot dot--expense"></span>支出</dt>
        <dd>${yen.format(expense)}</dd>
      </div>
    </dl>
  `;
}

// カテゴリ別の支出を多い順に並べ、割合を横棒で表示する
function renderBreakdown(monthEntries) {
  const totals = {};
  monthEntries
    .filter((e) => e.type === "expense")
    .forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    });

  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const sum = rows.reduce((s, [, v]) => s + v, 0);
  const max = rows.length ? rows[0][1] : 0;

  breakdownEmpty.hidden = rows.length > 0;
  breakdownList.innerHTML = rows
    .map(([cat, value]) => {
      const icon = CATEGORIES.expense[cat] ?? "•";
      return `
        <li class="breakdown-row">
          <span class="cat-icon" aria-hidden="true">${icon}</span>
          <div class="breakdown-main">
            <div class="breakdown-top">
              <span class="breakdown-cat">${escapeHtml(cat)}</span>
              <span class="breakdown-val">${yen.format(value)}<small>${Math.round((value / sum) * 100)}%</small></span>
            </div>
            <span class="breakdown-bar"><span style="width:${(value / max) * 100}%"></span></span>
          </div>
        </li>
      `;
    })
    .join("");
}

// 日付ごとにまとめ、見出しにその日の合計を出す
function renderList(monthEntries) {
  const visible = monthEntries
    .filter((e) => currentFilter === "all" || e.type === currentFilter)
    // 新しい日付順、同じ日なら後から登録したものを上に
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));

  const groups = new Map();
  visible.forEach((e) => {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  });

  emptyMessage.hidden = visible.length > 0;
  if (monthEntries.length > 0 && visible.length === 0) {
    emptyMessage.querySelector("p").textContent = "該当する記録はありません。";
  } else {
    emptyMessage.querySelector("p").innerHTML = "この月の記録はまだありません。<br>上の入力欄から追加してみましょう。";
  }

  const todayStr = toDateStr(new Date());
  entryGroups.innerHTML = [...groups]
    .map(([date, items]) => {
      const d = fromDateStr(date);
      const net = sumOf(items, "income") - sumOf(items, "expense");
      return `
        <section class="day-group">
          <h3 class="day-head">
            <span>${d.getMonth() + 1}月${d.getDate()}日<span class="weekday wd-${d.getDay()}">（${WEEKDAYS[d.getDay()]}）</span>${date === todayStr ? '<span class="today-badge">今日</span>' : ""}</span>
            <span class="day-total">${signedYen(net)}</span>
          </h3>
          <ul class="entry-list">
            ${items.map(renderItem).join("")}
          </ul>
        </section>
      `;
    })
    .join("");
}

function closeIcon() {
  return `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function renderItem(entry) {
  return `
    <li class="entry-item ${entry.type}">
      <span class="cat-icon" aria-hidden="true">${iconFor(entry)}</span>
      <div class="entry-content">
        <strong>${escapeHtml(entry.category)}${entry.recurringId ? '<span class="tag">固定費</span>' : ""}</strong>
        ${entry.memo ? `<span>${escapeHtml(entry.memo)}</span>` : ""}
      </div>
      <span class="entry-amount">${signedYen(entry.type === "income" ? entry.amount : -entry.amount)}</span>
      <button class="delete-btn" data-id="${entry.id}" aria-label="${escapeHtml(entry.category)} ${yen.format(entry.amount)} を削除">${closeIcon()}</button>
    </li>
  `;
}

function render() {
  monthLabel.textContent = `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`;
  const isCurrent = monthKey(viewMonth) === monthKey(new Date());
  const monthEntries = entries.filter((e) => e.date.startsWith(monthKey(viewMonth)));
  renderCheckin();
  renderSummary(monthEntries, isCurrent ? "今月の収支" : `${viewMonth.getMonth() + 1}月の収支`);
  renderBreakdown(monthEntries);
  renderList(monthEntries);
  renderRecurring();
  renderReminder();
}

function goToMonth(d) {
  viewMonth = startOfMonth(d);
  resetDateInput();
  render();
}

/* ---------- トーストと取り消し ---------- */

function showToast(message) {
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
  if (!undoSnapshot) return;
  ({ entries, meta } = JSON.parse(undoSnapshot));
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

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", b === btn);
    });
    currentFilter = btn.dataset.filter;
    render();
  });
});

$("prev-month").addEventListener("click", () => goToMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)));
$("next-month").addEventListener("click", () => goToMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)));
monthLabel.addEventListener("click", () => goToMonth(new Date()));

// 日付が変わったときや、タブに戻ってきたときに記録チェックを最新にする
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (applyRecurring().length) showToast("固定費を自動で記録しました");
    render();
  }
});

/* ---------- 起動 ---------- */

onTypeChange();
fillCategorySelect(recCategory, recType.value);
resetDateInput();
save();
const autoAdded = applyRecurring();
render();
scheduleReminder();
handleUrlCommand();
if (autoAdded.length && toast.hidden) showToast(`固定費を${autoAdded.length}件、自動で記録しました`);
