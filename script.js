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

// 他の人の分も払ったとき、誰のためだったかの区分
const PAYEES = {
  友人: "🧑‍🤝‍🧑",
  家族: "👪",
  パートナー: "💞",
  "職場・仕事": "💼",
  その他: "👤",
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 記録のうち自分のための金額。myAmount がなければ全額が自分の分
function myShare(e) {
  return Number.isFinite(e.myAmount) ? e.myAmount : e.amount;
}

// 割り勘の相手や家族など、自分以外のために払った金額
function othersShare(e) {
  return e.amount - myShare(e);
}

// 人の分の払い方: 割り勘・立て替え (あとで返してもらう分) と 奢り (返してもらわない分)
const SHARE_TYPES = {
  split: { label: "割り勘・立て替え", short: "立て替え", icon: "🤝" },
  treat: { label: "奢り", short: "奢り", icon: "🎁" },
};

// 人の分がある記録の払い方。以前の記録には shareType がないので割り勘として扱う
function shareTypeOf(e) {
  return e.shareType === "treat" ? "treat" : "split";
}

// 自分の分・相手・払い方を、形を整えてから記録に付ける (全額自分の分なら何も付けない)
function withShare(entry, myAmount, forWhom, shareType) {
  const { myAmount: _m, forWhom: _f, shareType: _t, ...rest } = entry;
  const mine = Math.round(Number(myAmount));
  if (myAmount === null || myAmount === undefined || myAmount === "" || !Number.isFinite(mine) || mine < 0 || mine >= rest.amount) return rest;
  return {
    ...rest,
    myAmount: mine,
    forWhom: PAYEES[forWhom] ? forWhom : "その他",
    shareType: shareType === "treat" ? "treat" : "split",
  };
}

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
const quickBtn = $("quick-btn");
const receiptDrop = $("receipt-drop");
const receiptCamera = $("receipt-camera");
const receiptLibrary = $("receipt-library");
const receiptCameraBtn = $("receipt-camera-btn");
const receiptLibraryBtn = $("receipt-library-btn");
const receiptThumbs = $("receipt-thumbs");
const receiptResults = $("receipt-results");
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
    autoNoSpendDays: [],
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

/* ---------- 支出なしの日と、きのうのふりかえり ---------- */

function dayOffset(n) {
  const t = new Date();
  return toDateStr(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
}

// 自分で入力した記録があるか、「支出なし」になっている日を「記録済み」とみなす
// (固定費の自動記録だけの日は、日々の支出を入れ忘れている可能性があるので含めない)
function isRecorded(dateStr) {
  return meta.noSpendDays.includes(dateStr) || entries.some((e) => e.date === dateStr && !e.recurringId);
}

// 支出なしの日: 「支出なし」になっていて、自分で入力した支出がない日 (固定費の引き落としだけの日も含む)
function isNoSpendDay(dateStr) {
  return meta.noSpendDays.includes(dateStr) && !entries.some((e) => e.date === dateStr && !e.recurringId);
}

function unrecordedDays() {
  const days = [];
  for (let i = 1; i <= CHECK_DAYS; i++) {
    const s = dayOffset(-i);
    if (s < meta.trackingStart) break;
    if (!isRecorded(s)) days.push(s);
  }
  return days;
}

function pruneNoSpend() {
  // 古い記録は不要なので、直近分だけ残す
  const limit = dayOffset(-90);
  meta.noSpendDays = meta.noSpendDays.filter((d) => d >= limit);
  meta.autoNoSpendDays = meta.autoNoSpendDays.filter((d) => d >= limit && meta.noSpendDays.includes(d));
}

// 日付が変わったら、前の日までで何も記録がない日を自動で「支出なし」にする
function autoMarkNoSpend() {
  const added = [];
  for (let i = 1; i <= 60; i++) {
    const s = dayOffset(-i);
    if (s < meta.trackingStart) break;
    if (!isRecorded(s)) added.push(s);
  }
  if (!added.length) return [];
  meta.noSpendDays = [...meta.noSpendDays, ...added];
  meta.autoNoSpendDays = [...meta.autoNoSpendDays, ...added];
  pruneNoSpend();
  save();
  return added;
}

// 支出なしの日が何日続いているか (今日が支出なしなら今日から、そうでなければ昨日から数える)
function noSpendStreak() {
  let i = isNoSpendDay(dayOffset(0)) ? 0 : 1;
  let count = 0;
  for (;; i++) {
    const s = dayOffset(-i);
    if (s < meta.trackingStart || !isNoSpendDay(s)) break;
    count++;
  }
  return count;
}

function markNoSpend(days) {
  snapshot();
  meta.noSpendDays = [...new Set([...meta.noSpendDays, ...days])];
  pruneNoSpend();
  save();
  render();
  showToast(days.length === 1 ? `${shortDate(days[0])} を「支出なし」にしました` : `${days.length}日分を「支出なし」にしました`);
}

function isPastReminderTime() {
  const [h, m] = meta.reminder.time.split(":").map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

// 日によって言い回しが変わるよう、日付から決まった1つを選ぶ
function pick(list, salt = 0) {
  const d = new Date();
  const n = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000) + salt;
  return list[((n % list.length) + list.length) % list.length];
}

const CHEERS_ZERO = [
  "お金を使わない日は、未来の自分へのプレゼントです。",
  "小さな「ゼロの日」の積み重ねが、月末の大きな差になります。",
  "この調子で、今日も「本当に必要なもの」だけにしていきましょう。",
  "使わずに済んだお金は、楽しみのためにとっておけます。",
];

const SAVING_TIPS = [
  "コンビニに寄る前に「本当に今いる？」と10秒だけ考えてみましょう。",
  "欲しい物は一晩おいてから買うと、衝動買いがぐっと減ります。",
  "水筒やお弁当を持って出ると、飲み物代・昼食代が浮きます。",
  "支払いの前に、家にある物で代わりにならないか思い出してみましょう。",
  "使っていないサブスクがないか、月に一度見直すと固定費が下がります。",
  "まとめ買いは「使い切れる量」だけにすると、むだが出にくくなります。",
  "ポイント還元より「買わない」がいちばん大きな節約です。",
];

// 自分で選んで使ったお金 (固定費を除いた、自分のための金額)
function ownSpentOn(dateStr) {
  return entries.filter((e) => e.date === dateStr && !e.recurringId).reduce((s, e) => s + myShare(e), 0);
}

// きのうの支出と予算のペースから、ひとことコメントを作る
function buildCheer() {
  const today = new Date();
  const yesterday = dayOffset(-1);
  const start = meta.trackingStart;

  if (yesterday < start) {
    return {
      tone: "start",
      icon: "🌱",
      title: start === dayOffset(0) ? "今日から記録スタート！" : `${shortDate(start)} から記録スタート！`,
      body: "毎日ひとこと入力するだけで、お金の流れが見えてきます。何も買わなかった日は、次の日に自動で「支出なし」になります。",
    };
  }

  if (isNoSpendDay(yesterday)) {
    const streak = noSpendStreak();
    return {
      tone: "zero",
      icon: "🎉",
      title: streak >= 2 ? `${streak}日連続で支出ゼロ！` : "昨日は支出ゼロでした！",
      body: pick(CHEERS_ZERO),
      autoDay: meta.autoNoSpendDays.includes(yesterday) ? yesterday : null,
    };
  }

  const spent = ownSpentOn(yesterday);
  const tip = pick(SAVING_TIPS, 3);

  if (meta.budget > 0) {
    // 予算を月の日数で割った「1日の目安」と比べる
    const target = Math.floor(meta.budget / daysInMonth(fromDateStr(yesterday)));
    if (spent <= target) {
      return {
        tone: "good",
        icon: "👏",
        title: `昨日は ${yen.format(spent)}。1日の目安以内です`,
        body: `目安の ${yen.format(target)} より ${yen.format(target - spent)} 少なく抑えられました。この調子でいきましょう。`,
      };
    }
    const monthEntries = entriesOfMonth(today);
    const mine = monthEntries.reduce((s, e) => s + myShare(e), 0);
    const remaining = meta.budget - mine - total(plannedForMonth(today));
    const daysLeft = daysInMonth(today) - today.getDate() + 1;
    return {
      tone: "care",
      icon: "🌤️",
      title: `昨日は ${yen.format(spent)} 使いました`,
      body:
        remaining > 0
          ? `今日からは1日 ${yen.format(Math.floor(remaining / daysLeft))} 以内にすると、予算どおりに過ごせます。${tip}`
          : `今月の予算はすでに使い切っています。今日は「支出ゼロの日」を目指してみませんか。${tip}`,
    };
  }

  // 予算がないときは、今月のこれまでの1日平均と比べる
  const days = [];
  for (let i = 2; i <= 31; i++) {
    const s = dayOffset(-i);
    if (s < start || s.slice(0, 7) !== yesterday.slice(0, 7)) break;
    days.push(ownSpentOn(s));
  }
  const avg = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  if (avg !== null && spent <= avg) {
    return {
      tone: "good",
      icon: "👏",
      title: `昨日は ${yen.format(spent)}。いつもより控えめです`,
      body: `今月のこれまでの1日平均 ${yen.format(avg)} より少なく済みました。`,
    };
  }
  return {
    tone: "care",
    icon: "💡",
    title: `昨日は ${yen.format(spent)} 使いました`,
    body: `${avg !== null ? `今月の1日平均は ${yen.format(avg)} です。` : ""}${tip}`,
  };
}

function renderCheckin() {
  const todayStr = dayOffset(0);
  const todayDone = isRecorded(todayStr);
  const cheer = buildCheer();
  const monthKeyNow = todayStr.slice(0, 7);
  const zeroDays = meta.noSpendDays.filter((d) => d.startsWith(monthKeyNow) && d >= meta.trackingStart && isNoSpendDay(d)).length;
  const streak = noSpendStreak();

  const todayLine = todayDone
    ? `<p class="checkin-status is-done"><span class="checkin-mark" aria-hidden="true">✓</span>${isNoSpendDay(todayStr) ? "今日は「支出なし」にしています" : "今日の記録は入力済みです"}</p>`
    : `<div class="checkin-status ${isPastReminderTime() ? "is-alert" : ""}">
        <span class="checkin-mark" aria-hidden="true">!</span>
        <span class="checkin-text">今日の支出はまだ記録していません<small>何も記録しなければ、明日「支出なし」になります</small></span>
        <button type="button" class="chip-btn" data-action="input" data-date="${todayStr}">入力する</button>
      </div>`;

  checkinBox.innerHTML = `
    <div class="card-head">
      <h2 class="section-title">きのうのふりかえり</h2>
      <span class="streak" title="支出なしの日">🌱 今月の支出ゼロ <strong>${zeroDays}</strong> 日${streak >= 2 ? `・<strong>${streak}</strong> 日連続` : ""}</span>
    </div>
    <div class="cheer is-${cheer.tone}">
      <span class="cheer-icon" aria-hidden="true">${cheer.icon}</span>
      <div class="cheer-text">
        <p class="cheer-title">${cheer.title}</p>
        <p class="cheer-body">${cheer.body}</p>
        ${
          cheer.autoDay
            ? `<p class="cheer-note">何も記録がなかったので自動で「支出なし」にしました。入れ忘れがあれば <button type="button" class="link-btn" data-action="input" data-date="${cheer.autoDay}">${shortDate(cheer.autoDay)} の支出を入力</button></p>`
            : ""
        }
      </div>
    </div>
    ${todayLine}
  `;
}

checkinBox.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, date } = btn.dataset;
  if (action === "nospend") markNoSpend([date]);
  if (action === "input") focusQuickInput(date);
});

// ページを開いたまま日付が変わったときも、前の日を「支出なし」にしてふりかえりを更新する
let dayTimer = null;
function scheduleDayChange() {
  clearTimeout(dayTimer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
  dayTimer = setTimeout(() => {
    if (!inViewer || db) {
      applyRecurring();
      autoMarkNoSpend();
    }
    resetDateInput();
    render();
    scheduleDayChange();
  }, next - now);
}

// 日付を入れた状態でクイック入力に移動する (今日なら日付は省略)
function focusQuickInput(date) {
  if (editingId) endEdit();
  setTab("quick");
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
      const n = new Notification("カネミル：今日の支出を記録しましたか？", {
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
    "SUMMARY:カネミルで支出を記録する",
    `DESCRIPTION:今日の支出を記録しましょう。\\n${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:カネミルで支出を記録する",
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
      await downloads.save({ filename: "カネミル_リマインダー.ics", data });
    } catch (e) {
      if (e?.code !== "cancelled" && e?.code !== "declined") showToast("カレンダー用ファイルを保存できませんでした");
    }
    return;
  }
  const blob = new Blob([data], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "カネミル_リマインダー.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("ics-btn").addEventListener("click", downloadIcs);

/* ---------- クイック入力 ---------- */

function describeEntry(entry) {
  const share = othersShare(entry) > 0 ? `（${SHARE_TYPES[shareTypeOf(entry)].short}・自分の分 ${yen.format(myShare(entry))}）` : "";
  return `${iconFor(entry.category)} ${entry.category} ${yen.format(entry.amount)}${share}`;
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
    setTab("quick");
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
      return withShare({ date, category, amount, memo, ...(source ? { source } : {}) }, raw?.myAmount, raw?.forWhom, raw?.shareType);
    })
    .filter(Boolean);
}

// 読み取りの進み具合やエラーを出す場所。文章の入力欄とレシート欄でそれぞれ持つ
function makePanel(prefix, buttons) {
  const panel = { box: $(`${prefix}-status`), text: $(`${prefix}-status-text`), cancel: $(`${prefix}-cancel`), buttons, ctl: null };
  panel.cancel.addEventListener("click", () => {
    if (panel.ctl) panel.ctl.abort();
    else clearAiError(panel);
  });
  return panel;
}

const quickPanel = makePanel("ai", [quickBtn]);
const receiptPanel = makePanel("receipt", [receiptCameraBtn, receiptLibraryBtn]);

function setAiBusy(panel, label) {
  const busy = Boolean(label);
  if (busy) {
    panel.box.classList.remove("is-error");
    panel.box.hidden = false;
    panel.text.textContent = label;
    panel.cancel.textContent = "中止";
  } else if (!panel.box.classList.contains("is-error")) {
    panel.box.hidden = true;
  }
  panel.box.classList.toggle("is-busy", busy);
  panel.buttons.forEach((b) => (b.disabled = busy));
}

function showAiError(panel, message) {
  panel.box.classList.add("is-error");
  panel.box.classList.remove("is-busy");
  panel.box.hidden = false;
  panel.text.textContent = message;
  panel.cancel.textContent = "閉じる";
}

function clearAiError(panel) {
  if (panel.box.classList.contains("is-error")) {
    panel.box.classList.remove("is-error");
    panel.box.hidden = true;
  }
}

function disableClaude(panel, message) {
  sample = null;
  setReceiptAvailable(false);
  document.querySelectorAll(".ai-only").forEach((el) => (el.hidden = true));
  updateQuickPreview();
  // レシート欄は隠れるので、メッセージは常に入力欄の下に出す
  showAiError(quickPanel, message);
}

function handleAiError(panel, e) {
  switch (e?.code) {
    case "cancelled":
      return;
    case "not_granted":
    case "sampling_disabled":
    case "not_declared":
    case "capability_disabled":
    case "capability_removed":
      disableClaude(panel, "Claude への読み取りが許可されていないため、この機能をオフにしました。決まった書き方（例: ランチ 800）なら記録できます。");
      return;
    case "images_unavailable":
      setReceiptAvailable(false);
      showAiError(quickPanel, "この表示では写真を送れません。金額を文章で入力してください。");
      return;
    case "image_rejected":
      showAiError(panel, "この画像は読み取れませんでした。JPEG・PNG などの写真を選び直してください。");
      return;
    case "rate_limited":
      showAiError(panel, "Claude の利用が混み合っているか、上限に達しました。少し時間をおいてからもう一度送ってください。");
      return;
    case "session_expired":
      showAiError(panel, "ログインの有効期限が切れました。claude.ai にログインし直してください。");
      return;
    case "refused":
      showAiError(panel, "この内容は読み取れませんでした。別の写真や書き方で送り直してください。");
      return;
    default:
      showAiError(panel, "読み取りに失敗しました。もう一度送ってください。");
  }
}

async function runAi(panel, label, prompt, options = {}) {
  panel.ctl?.abort();
  const ctl = new AbortController();
  panel.ctl = ctl;
  setAiBusy(panel, label);
  try {
    return await sample.json(prompt, { ...options, signal: ctl.signal, cache: false });
  } catch (e) {
    handleAiError(panel, e);
    return null;
  } finally {
    if (panel.ctl === ctl) {
      panel.ctl = null;
      setAiBusy(panel, null);
    }
  }
}

async function askClaudeText(text) {
  const prompt = `あなたは支出管理アプリの入力係です。次の文章に書かれた「お金を払った出来事」をすべて抜き出してください。

今日: ${todayLine()}
カテゴリ（必ずこの中から1つ）: ${CATEGORY_LIST}

ルール:
- amount は支払った金額（円、整数）。「1.2万」「3k」なども円に直す。
- date は YYYY-MM-DD。書かれていなければ今日。「昨日」「先週の金曜」などは今日から計算する。未来の日付にはしない。
- memo は店名や品名などを20文字以内で。なければ空文字。
- 割り勘・立て替え・奢りなど人の分も払った場合: amount は自分が実際に払った合計、myAmount はそのうち自分のための金額（円、整数）。
  「3人で割り勘」なら amount ÷ 3、「自分の分は500円」ならその金額。全額が相手のため（奢り・プレゼント・立て替え）なら 0。
  forWhom は誰のためか（${Object.keys(PAYEES).join("、")} から1つ）。
  shareType は、あとで返してもらう割り勘・立て替えなら "split"、奢り・プレゼントなど返してもらわないなら "treat"。
  全額が自分のためなら myAmount・forWhom・shareType は null。
- 収入・もらったお金・予定（まだ払っていないもの）は含めない。
- 支出が1つも読み取れなければ entries を空にして、reason に短い理由を書く。

返答は次の形の JSON だけ:
{"entries":[{"date":"2026-01-31","category":"食費","amount":650,"memo":"スタバ","myAmount":null,"forWhom":null,"shareType":null},{"date":"2026-01-31","category":"交際費","amount":6000,"memo":"飲み会","myAmount":2000,"forWhom":"友人","shareType":"split"},{"date":"2026-01-31","category":"食費","amount":3000,"memo":"後輩にランチ","myAmount":1000,"forWhom":"友人","shareType":"treat"}],"reason":""}

文章:
"""
${text.slice(0, 2000)}
"""`;
  const data = await runAi(quickPanel, "Claude が読み取り中…", prompt, { modelTier: "quick" });
  if (!data) return null;
  const list = sanitizeAiEntries(data.entries);
  if (!list.length) {
    showAiError(quickPanel, `支出を読み取れませんでした${data.reason ? `（${String(data.reason).slice(0, 80)}）` : ""}。金額が分かるように書いてください。`);
    return null;
  }
  clearAiError(quickPanel);
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
  showReceiptThumbs(files);
  receiptResults.hidden = true;
  const data = await runAi(receiptPanel, `レシート${files.length > 1 ? `${files.length}枚` : ""}を読み取り中…`, prompt, { images: files, modelTier: "default" });
  showReceiptThumbs([]);
  if (!data) return;
  const list = sanitizeAiEntries(data.entries, "receipt");
  const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
  if (!list.length) {
    showAiError(receiptPanel, "レシートの金額を読み取れませんでした。明るい場所で、レシート全体が写るように撮り直してください。");
    return;
  }
  clearAiError(receiptPanel);
  commitEntries(list, "レシートから ");
  showReceiptResults(list);
  if (skipped) showAiError(receiptPanel, `${skipped}枚は読み取れなかったため記録していません。`);
}

// 読み取り中は、送った写真を小さく並べて見せる
function showReceiptThumbs(files) {
  receiptThumbs.querySelectorAll("img").forEach((img) => URL.revokeObjectURL(img.src));
  receiptThumbs.innerHTML = "";
  files.forEach((f) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(f);
    img.alt = "送ったレシートの写真";
    receiptThumbs.append(img);
  });
  receiptThumbs.hidden = files.length === 0;
}

// 読み取って記録した内容を、次に読み取るまでこの欄に残しておく
function showReceiptResults(list) {
  receiptResults.innerHTML = `
    <p class="receipt-results-head"><span class="checkin-mark" aria-hidden="true">✓</span>${list.length}件を記録しました<strong>${yen.format(total(list))}</strong></p>
    <ul class="receipt-result-list">
      ${list
        .map(
          (e) => `
        <li>
          <span class="cat-icon" aria-hidden="true">${iconFor(e.category)}</span>
          <div class="entry-content">
            <strong>${escapeHtml(e.memo || e.category)}</strong>
            <span>${shortDate(e.date)}・${escapeHtml(e.category)}</span>
          </div>
          <span class="entry-amount">${yen.format(e.amount)}</span>
        </li>`
        )
        .join("")}
    </ul>
    <p class="receipt-results-note">金額やカテゴリが違うときは、履歴でその記録を押すと変更できます（割り勘・奢りの設定も可）。</p>`;
  receiptResults.hidden = false;
}

function sendReceiptFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!files.length || !sample || receiptPanel.ctl) return;
  if (files.length > maxImages) showToast(`一度に送れるのは${maxImages}枚までです。最初の${maxImages}枚を読み取ります`);
  readReceipts(files.slice(0, maxImages));
}

receiptCameraBtn.addEventListener("click", () => receiptCamera.click());
receiptLibraryBtn.addEventListener("click", () => receiptLibrary.click());
[receiptCamera, receiptLibrary].forEach((input) =>
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = "";
    sendReceiptFiles(files);
  })
);

// PC では画像のドラッグ＆ドロップや貼り付けでも送れる
receiptDrop.addEventListener("dragover", (e) => {
  if (!sample) return;
  e.preventDefault();
  receiptDrop.classList.add("is-dragover");
});
receiptDrop.addEventListener("dragleave", () => receiptDrop.classList.remove("is-dragover"));
receiptDrop.addEventListener("drop", (e) => {
  e.preventDefault();
  receiptDrop.classList.remove("is-dragover");
  sendReceiptFiles(e.dataTransfer?.files ?? []);
});
document.addEventListener("paste", (e) => {
  if (!receiptAvailable) return;
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  sendReceiptFiles(files);
});

async function connectClaude() {
  const s = await claude.use("sample");
  if (!s) return;
  sample = s;
  const caps = await s.limits().catch(() => null);
  if (caps?.images) {
    maxImages = caps.images.maxCount || 1;
    const accept = caps.images.mediaTypes.join(",");
    receiptCamera.accept = accept;
    receiptLibrary.accept = accept;
    receiptLibrary.multiple = maxImages > 1;
    $("receipt-max").textContent = maxImages;
    setReceiptAvailable(true);
    // 前回レシートのタブを使っていたら、それを開き直す
    if (loadJson(TAB_KEY, "quick") === "receipt" && !editingId) setTab("receipt", { remember: false });
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
  return withShare(
    {
      ...raw,
      id,
      type: "expense",
      date: String(raw.date),
      amount,
      category: CATEGORIES[raw.category] ? raw.category : "その他",
      memo: String(raw.memo ?? "").slice(0, 60),
    },
    raw.myAmount,
    raw.forWhom,
    raw.shareType
  );
}

// サーバーから届くデータは読み取り専用 (凍結済み) なので、丸ごと複製してから手元で書き換える
function normalizeMeta(raw) {
  const m = { ...JSON.parse(JSON.stringify(meta)), ...JSON.parse(JSON.stringify(raw || {})) };
  m.noSpendDays = Array.isArray(m.noSpendDays) ? m.noSpendDays : [];
  m.autoNoSpendDays = Array.isArray(m.autoNoSpendDays) ? m.autoNoSpendDays : [];
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
  autoMarkNoSpend();
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

/* 入力方法のタブ (ひとこと / レシート / フォーム) */

const TAB_KEY = "household-budget-tab";
const hubTabs = document.querySelectorAll(".hub-tab");
const hubPanels = { quick: $("panel-quick"), receipt: $("panel-receipt"), form: form };
let receiptAvailable = false;

// 選んだタブを表示する。最後に使ったタブは、この端末だけの表示設定として覚えておく
function setTab(name, { remember = true } = {}) {
  if (name === "receipt" && !receiptAvailable) name = "quick";
  hubTabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
  });
  Object.entries(hubPanels).forEach(([key, panel]) => (panel.hidden = key !== name));
  if (remember) saveJson(TAB_KEY, name);
}

function setReceiptAvailable(on) {
  receiptAvailable = on;
  $("tab-receipt").hidden = !on;
  if (!on && !hubPanels.receipt.hidden) setTab("quick");
}

hubTabs.forEach((t) =>
  t.addEventListener("click", () => {
    setTab(t.dataset.tab);
    if (t.dataset.tab === "quick") quickInput.focus();
    if (t.dataset.tab === "form" && !editingId) amountInput.focus();
  })
);

// 左右キーでタブを移動できるようにする
$("entry-hub").querySelector(".hub-tabs").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const visible = [...hubTabs].filter((t) => !t.hidden);
  const i = visible.indexOf(document.activeElement);
  if (i < 0) return;
  const next = visible[(i + (e.key === "ArrowRight" ? 1 : visible.length - 1)) % visible.length];
  next.focus();
  next.click();
});

/* 割り勘・奢り (人の分も払った) */

const splitBox = $("split-box");
const myAmountInput = $("my-amount");
const forWhomSelect = $("for-whom");
const splitCalc = $("split-calc");
const shareTypeRadios = form.querySelectorAll('input[name="share-type"]');

forWhomSelect.innerHTML = Object.entries(PAYEES)
  .map(([name, icon]) => `<option value="${name}">${icon} ${name}</option>`)
  .join("");

function selectedShareType() {
  return form.querySelector('input[name="share-type"]:checked').value;
}

function setShareType(type) {
  shareTypeRadios.forEach((r) => (r.checked = r.value === type));
}

// 合計と自分の分から「相手の分」を計算して見せる
function updateSplitCalc() {
  const amount = Math.round(Number(amountInput.value));
  const mine = myAmountInput.value === "" ? null : Math.round(Number(myAmountInput.value));
  const kind = SHARE_TYPES[selectedShareType()];
  let text = "";
  let error = false;
  if (!amount) text = "上の金額に、自分が払った合計を入れてください。";
  else if (mine === null) text = `合計 ${yen.format(amount)} のうち、自分のための金額を入れてください。`;
  else if (mine > amount) {
    text = `自分の分が合計 ${yen.format(amount)} より多くなっています。`;
    error = true;
  } else if (mine === amount) text = "全額が自分の分として記録されます。";
  else text = `自分の分 ${yen.format(mine)} ／ ${forWhomSelect.value}への${kind.short} ${yen.format(amount - mine)}`;
  splitCalc.textContent = text;
  splitCalc.classList.toggle("is-error", error);
  myAmountInput.setCustomValidity(error ? "自分の分は合計以下にしてください" : "");
}

[amountInput, myAmountInput].forEach((el) => el.addEventListener("input", updateSplitCalc));
forWhomSelect.addEventListener("change", updateSplitCalc);
shareTypeRadios.forEach((r) => r.addEventListener("change", updateSplitCalc));
splitBox.addEventListener("toggle", updateSplitCalc);

splitBox.querySelector(".split-quick").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-split]");
  if (!btn) return;
  const amount = Math.round(Number(amountInput.value));
  if (!amount) {
    amountInput.focus();
    updateSplitCalc();
    return;
  }
  const n = Number(btn.dataset.split);
  myAmountInput.value = n ? Math.round(amount / n) : 0;
  updateSplitCalc();
});

/* 記録の変更 (履歴の行を押すと、いちばん上のフォームで直せる) */

let editingId = null;

function startEdit(entry) {
  editingId = entry.id;
  dateInput.value = entry.date;
  categorySelect.value = entry.category;
  amountInput.value = entry.amount;
  memoInput.value = entry.memo || "";
  const shared = othersShare(entry) > 0;
  myAmountInput.value = shared ? myShare(entry) : "";
  forWhomSelect.value = shared && PAYEES[entry.forWhom] ? entry.forWhom : "友人";
  setShareType(shared ? shareTypeOf(entry) : "split");
  splitBox.open = shared;
  updateSplitCalc();
  $("entry-hub").classList.add("is-editing");
  $("form-title").textContent = `${shortDate(entry.date)} の「${entry.memo || entry.category}」を変更中`;
  $("edit-banner").hidden = false;
  $("submit-btn").textContent = "変更を保存";
  setTab("form", { remember: false });
  $("entry-hub").scrollIntoView({ block: "start", behavior: "smooth" });
  amountInput.focus({ preventScroll: true });
}

function endEdit() {
  editingId = null;
  $("entry-hub").classList.remove("is-editing");
  $("edit-banner").hidden = true;
  $("submit-btn").textContent = "支出を追加";
  amountInput.value = "";
  memoInput.value = "";
  myAmountInput.value = "";
  forWhomSelect.value = "友人";
  setShareType("split");
  splitBox.open = false;
  resetDateInput();
}

$("cancel-edit").addEventListener("click", endEdit);

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const amount = Math.round(Number(amountInput.value));
  if (!amount || amount <= 0) return;
  const mine = splitBox.open && myAmountInput.value !== "" ? Math.round(Number(myAmountInput.value)) : null;
  if (mine !== null && mine > amount) {
    updateSplitCalc();
    myAmountInput.focus();
    return;
  }

  const fields = { date: dateInput.value, category: categorySelect.value, amount, memo: memoInput.value.trim() };
  const share = [mine, forWhomSelect.value, selectedShareType()];
  const added = withShare(fields, ...share);
  const wasEditing = Boolean(editingId);
  snapshot();
  if (wasEditing) {
    const old = entries.find((x) => x.id === editingId);
    if (old) {
      const updated = withShare({ ...old, ...fields }, ...share);
      entries = entries.map((x) => (x.id === editingId ? updated : x));
    }
  } else {
    addEntries([added]);
  }
  save();

  // 登録した日付の月へ移動して、追加結果がすぐ見えるようにする
  viewMonth = startOfMonth(fromDateStr(dateInput.value));
  endEdit();
  render();
  showToast(wasEditing ? "記録を変更しました" : `${describeEntry(added)} を追加しました`);
  if (!wasEditing) amountInput.focus();
});

/* ---------- 月の表示 ---------- */

// 自分のための支出 (予算の対象) と、人の分も含めて払った合計を出す
// 割り勘・立て替えと奢りで相手の分として払った金額は、予算やカテゴリ別には含めない
function renderSummary(monthEntries, planned) {
  const today = new Date();
  const isCurrent = monthKey(viewMonth) === monthKey(today);
  const isFuture = viewMonth > today;
  const paid = total(monthEntries);
  const mine = monthEntries.reduce((s, e) => s + myShare(e), 0);
  const plannedSum = total(planned);
  const prevEntries = entriesOfMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const prevMine = prevEntries.reduce((s, e) => s + myShare(e), 0);
  const elapsedDays = isCurrent ? today.getDate() : isFuture ? 0 : daysInMonth(viewMonth);
  const dailyAvg = elapsedDays ? Math.round(mine / elapsedDays) : 0;
  const people = sumOthers(monthEntries);

  let budgetBlock;
  if (meta.budget > 0) {
    // 固定費はその日が来る前から「使うことが決まったお金」として予算から差し引く
    const committed = mine + plannedSum;
    const pct = Math.round((committed / meta.budget) * 100);
    const remaining = meta.budget - committed;
    const daysLeft = isCurrent ? daysInMonth(today) - today.getDate() + 1 : 0;
    const planNote = plannedSum ? `<span class="note-sub">固定費の予定 ${yen.format(plannedSum)} を差し引き済み</span>` : "";
    let note;
    if (remaining < 0 && mine > meta.budget) note = `予算を <strong class="is-over">${yen.format(mine - meta.budget)}</strong> 超えています`;
    else if (remaining < 0) note = `固定費の予定を含めると予算を <strong class="is-over">${yen.format(-remaining)}</strong> 超える見込みです`;
    else if (isCurrent) note = `あと <strong>${yen.format(remaining)}</strong>・1日 ${yen.format(Math.floor(remaining / daysLeft))} まで${planNote}`;
    else note = `残り <strong>${yen.format(remaining)}</strong>${planNote}`;

    // 使った分に続けて、これから引き落とされる固定費を斜線で示す
    const usedWidth = Math.min(100, (mine / meta.budget) * 100);
    const planWidth = Math.min(100 - usedWidth, (plannedSum / meta.budget) * 100);
    budgetBlock = `
      <div class="budget">
        <div class="meter ${pct >= 100 ? "is-over" : pct >= 80 ? "is-warn" : ""}" role="img" aria-label="予算の${pct}%を使用${plannedSum ? `、ほかに固定費の予定 ${yen.format(plannedSum)}` : ""}">
          <span class="meter-used" style="width:${usedWidth}%"></span>
          ${planWidth > 0 ? `<span class="meter-plan" style="width:${planWidth}%"></span>` : ""}
        </div>
        <p class="meter-note"><span>${note}</span><span class="meter-pct">予算 ${yen.format(meta.budget)} の ${pct}%</span></p>
      </div>`;
  } else {
    budgetBlock = `<p class="meter-note"><button type="button" class="link-btn" id="set-budget-btn">月の予算を設定する</button></p>`;
  }

  const planLine = plannedSum
    ? `<p class="plan-line"><span class="legend-swatch is-plan" aria-hidden="true"></span>固定費の予定 <strong>${yen.format(plannedSum)}</strong>（${planned.length}件）を含めると自分の支出は <strong>${yen.format(mine + plannedSum)}</strong></p>`
    : "";

  let compare = "—";
  if (prevMine > 0) {
    const diff = mine - prevMine;
    compare = `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${yen.format(Math.abs(diff))}`;
  }

  summaryBox.innerHTML = `
    <div class="card-head">
      <h2 class="section-title">${isCurrent ? "今月" : `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`}の合計</h2>
      <span class="head-note">予算は自分のための支出で計算</span>
    </div>
    <div class="summary-totals">
      <div class="total-main">
        <span class="total-label">自分のための支出</span>
        <span class="summary-balance">${yen.format(mine)}</span>
      </div>
      <div class="total-sub">
        <span class="total-label">支払い合計<small>（人の分を含む）</small></span>
        <span class="total-value">${yen.format(paid)}</span>
      </div>
    </div>
    ${budgetBlock}
    ${planLine}
    <dl class="stat-row">
      <div>
        <dt>${SHARE_TYPES.split.icon} 立て替え</dt>
        <dd><a href="#people-title" class="stat-link">${yen.format(people.totals.split)}</a></dd>
      </div>
      <div>
        <dt>${SHARE_TYPES.treat.icon} 奢り</dt>
        <dd><a href="#people-title" class="stat-link">${yen.format(people.totals.treat)}</a></dd>
      </div>
      <div>
        <dt>1日平均（自分）</dt>
        <dd>${yen.format(dailyAvg)}</dd>
      </div>
      <div>
        <dt>前月との差</dt>
        <dd class="${prevMine > 0 && mine > prevMine ? "is-up" : ""}">${compare}</dd>
      </div>
    </dl>
  `;
  $("set-budget-btn")?.addEventListener("click", () => {
    settings.open = true;
    budgetInput.focus();
    budgetInput.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

// 相手ごとに、立て替え (割り勘) と奢りで払った「相手の分」を別々に合計する
function sumOthers(list) {
  const rows = {};
  const totals = { split: 0, treat: 0 };
  const counts = { split: 0, treat: 0 };
  list.forEach((e) => {
    const o = othersShare(e);
    if (o <= 0) return;
    const type = shareTypeOf(e);
    const who = PAYEES[e.forWhom] ? e.forWhom : "その他";
    rows[who] ??= { split: 0, treat: 0 };
    rows[who][type] += o;
    totals[type] += o;
    counts[type] += 1;
  });
  return { rows, totals, counts };
}

function renderPeople(monthEntries) {
  const { rows, totals, counts } = sumOthers(monthEntries);
  const body = $("people-body");
  const list = Object.entries(rows)
    .map(([who, r]) => ({ who, ...r, total: r.split + r.treat }))
    .sort((a, b) => b.total - a.total);

  if (!list.length) {
    body.innerHTML = `<p class="muted">この月の立て替え・奢りはまだありません。フォームの「割り勘・奢り」や、<code>飲み会 6000 自分2000</code>・<code>後輩に奢り 3000</code> のような入力で記録できます。</p>`;
    return;
  }

  const cell = (v) => (v ? yen.format(v) : `<span class="zero">—</span>`);
  body.innerHTML = `
    <div class="people-totals">
      <div class="people-total is-split">
        <span>${SHARE_TYPES.split.icon} 立て替え（割り勘）</span>
        <strong>${yen.format(totals.split)}</strong>
        <small>${counts.split}件・あとで返してもらう分</small>
      </div>
      <div class="people-total is-treat">
        <span>${SHARE_TYPES.treat.icon} 奢り</span>
        <strong>${yen.format(totals.treat)}</strong>
        <small>${counts.treat}件・返してもらわない分</small>
      </div>
    </div>
    <div class="table-scroll">
      <table class="people-table">
        <thead>
          <tr><th scope="col">相手</th><th scope="col">立て替え</th><th scope="col">奢り</th><th scope="col">合計</th></tr>
        </thead>
        <tbody>
          ${list
            .map(
              (r) => `
            <tr>
              <th scope="row"><span aria-hidden="true">${PAYEES[r.who]}</span> ${escapeHtml(r.who)}</th>
              <td>${cell(r.split)}</td>
              <td>${cell(r.treat)}</td>
              <td><strong>${yen.format(r.total)}</strong></td>
            </tr>`
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr><th scope="row">合計</th><td>${yen.format(totals.split)}</td><td>${yen.format(totals.treat)}</td><td><strong>${yen.format(totals.split + totals.treat)}</strong></td></tr>
        </tfoot>
      </table>
    </div>`;
}

// カテゴリ別の支出を多い順に並べ、割合を横棒で表示する
// まだ引き落とされていない固定費も、そのカテゴリに斜線の部分として含める
// 割り勘・奢りで相手の分として払った金額は含めず、自分のための金額だけで集計する
function renderBreakdown(monthEntries, planned) {
  const totals = {};
  const add = (category, key, value) => {
    if (!value) return;
    totals[category] ??= { spent: 0, planned: 0 };
    totals[category][key] += value;
  };
  monthEntries.forEach((e) => add(e.category, "spent", myShare(e)));
  planned.forEach((e) => add(e.category, "planned", e.amount));

  const rows = Object.entries(totals)
    .map(([cat, t]) => ({ cat, ...t, total: t.spent + t.planned }))
    .sort((a, b) => b.total - a.total);
  const sum = rows.reduce((s, r) => s + r.total, 0);
  const max = rows.length ? rows[0].total : 0;

  breakdownEmpty.hidden = rows.length > 0;
  breakdownList.innerHTML = rows
    .map(
      (r) => `
        <li class="breakdown-row">
          <span class="cat-icon" aria-hidden="true">${iconFor(r.cat)}</span>
          <div class="breakdown-main">
            <div class="breakdown-top">
              <span class="breakdown-cat">${escapeHtml(r.cat)}${r.planned ? `<span class="breakdown-plan">うち予定 ${yen.format(r.planned)}</span>` : ""}</span>
              <span class="breakdown-val">${yen.format(r.total)}<small>${Math.round((r.total / sum) * 100)}%</small></span>
            </div>
            <span class="breakdown-bar">
              <span class="bar-spent" style="width:${(r.spent / max) * 100}%"></span>
              ${r.planned ? `<span class="bar-plan" style="width:${(r.planned / max) * 100}%"></span>` : ""}
            </span>
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
  $("cal-totals").innerHTML = `<span>支払額 <strong>${yen.format(spentSum)}</strong></span>${
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
  const others = othersShare(entry);
  return `
    <li class="entry-item is-editable" data-edit="${entry.id}" tabindex="0" role="button" aria-label="${escapeHtml(entry.category)} ${yen.format(entry.amount)}${others ? `（自分の分 ${yen.format(myShare(entry))}）` : ""}。押すと変更できます">
      <span class="cat-icon" aria-hidden="true">${iconFor(entry.category)}</span>
      <div class="entry-content">
        <strong>${escapeHtml(entry.category)}${entry.recurringId ? '<span class="tag">固定費</span>' : ""}${entry.source === "receipt" ? '<span class="tag">レシート</span>' : ""}${others ? `<span class="tag tag--${shareTypeOf(entry)}">${SHARE_TYPES[shareTypeOf(entry)].icon} ${SHARE_TYPES[shareTypeOf(entry)].short}</span>` : ""}</strong>
        ${entry.memo ? `<span>${escapeHtml(entry.memo)}</span>` : ""}
        ${others ? `<span class="share-line">自分 <b>${yen.format(myShare(entry))}</b> ／ ${PAYEES[entry.forWhom] ?? "👤"} ${escapeHtml(PAYEES[entry.forWhom] ? entry.forWhom : "その他")}の分 <b>${yen.format(others)}</b></span>` : ""}
      </div>
      <span class="entry-amount">${yen.format(entry.amount)}${others ? `<small>支払額</small>` : ""}</span>
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
  renderPeople(monthEntries);
  renderBreakdown(monthEntries, planned);
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
  if (btn) {
    const entry = entries.find((en) => en.id === btn.dataset.id);
    if (!entry) return;
    snapshot();
    entries = entries.filter((en) => en !== entry);
    if (editingId === entry.id) endEdit();
    save();
    render();
    showToast(`「${entry.category}」を削除しました`);
    return;
  }
  // 行そのものを押したら、フォームで内容を変更できるようにする
  const row = e.target.closest(".entry-item[data-edit]");
  const entry = row && entries.find((en) => en.id === row.dataset.edit);
  if (entry) startEdit(entry);
});

entryGroups.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest(".entry-item[data-edit]");
  if (!row || e.target !== row) return;
  e.preventDefault();
  const entry = entries.find((en) => en.id === row.dataset.edit);
  if (entry) startEdit(entry);
});

$("prev-month").addEventListener("click", () => goToMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)));
$("next-month").addEventListener("click", () => goToMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)));
monthLabel.addEventListener("click", () => goToMonth(new Date()));

// 日付が変わったときや、タブに戻ってきたときに記録チェックを最新にする
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (!inViewer || db) {
      if (applyRecurring().length) showToast("固定費を自動で記録しました");
      autoMarkNoSpend();
    }
    render();
  }
});

/* ---------- 起動 ---------- */

fillCategorySelect(categorySelect);
fillCategorySelect(recCategory);
resetDateInput();
setTab(loadJson(TAB_KEY, "quick"), { remember: false });
document.querySelectorAll(".local-only").forEach((el) => (el.hidden = inViewer));
document.querySelectorAll(".viewer-only").forEach((el) => (el.hidden = !inViewer));

scheduleDayChange();

if (inViewer) {
  // claude.ai 上では、サーバーのデータが届いてから固定費や「支出なし」を処理する
  render();
  connectDb();
  connectClaude();
} else {
  save();
  const autoAdded = applyRecurring();
  autoMarkNoSpend();
  render();
  scheduleReminder();
  handleUrlCommand();
  if (autoAdded.length && toast.hidden) showToast(`固定費を${autoAdded.length}件、自動で記録しました`);
}
