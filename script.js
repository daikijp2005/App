// 収支データは配列として持ち、ブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const STORAGE_KEY = "household-budget";

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

let entries = loadEntries();
let currentFilter = "all";
let viewMonth = startOfMonth(new Date());
let lastDeleted = null;
let toastTimer = null;

const form = document.getElementById("entry-form");
const dateInput = document.getElementById("date");
const categorySelect = document.getElementById("category");
const amountInput = document.getElementById("amount");
const memoInput = document.getElementById("memo");
const submitBtn = document.getElementById("submit-btn");
const typeRadios = form.querySelectorAll('input[name="type"]');
const entryGroups = document.getElementById("entry-groups");
const emptyMessage = document.getElementById("empty-message");
const filterButtons = document.querySelectorAll(".filter-btn");
const summaryBox = document.getElementById("summary");
const monthLabel = document.getElementById("month-label");
const breakdownList = document.getElementById("breakdown-list");
const breakdownEmpty = document.getElementById("breakdown-empty");
const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");
const undoBtn = document.getElementById("undo-btn");

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

// 符号付きで表示する (ハイフンではなくマイナス記号を使い、表記をそろえる)
function signedYen(value) {
  if (value === 0) return yen.format(0);
  return `${value > 0 ? "+" : "−"}${yen.format(Math.abs(value))}`;
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 保存できない環境(プライベートモード等)でも画面上の操作は続けられるようにする
  }
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// "YYYY-MM-DD" 形式の文字列を作る (toISOString は UTC になるため使わない)
function toDateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function monthKey(d) {
  return toDateStr(d).slice(0, 7);
}

function iconFor(entry) {
  return CATEGORIES[entry.type]?.[entry.category] ?? "•";
}

function getSelectedType() {
  return form.querySelector('input[name="type"]:checked').value;
}

function onTypeChange() {
  const type = getSelectedType();
  categorySelect.innerHTML = Object.entries(CATEGORIES[type])
    .map(([name, icon]) => `<option value="${name}">${icon} ${name}</option>`)
    .join("");
  form.dataset.type = type;
  submitBtn.textContent = type === "income" ? "収入を追加" : "支出を追加";
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

function entriesInViewMonth() {
  const key = monthKey(viewMonth);
  return entries.filter((e) => e.date.startsWith(key));
}

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
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const groups = new Map();
  visible.forEach((e) => {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  });

  emptyMessage.hidden = visible.length > 0;
  if (monthEntries.length > 0 && visible.length === 0) {
    emptyMessage.querySelector("p").textContent = "該当する記録はありません。";
  } else {
    emptyMessage.querySelector("p").innerHTML = "この月の記録はまだありません。<br>上のフォームから追加してみましょう。";
  }

  entryGroups.innerHTML = [...groups]
    .map(([date, items]) => {
      const d = new Date(`${date}T00:00:00`);
      const net = sumOf(items, "income") - sumOf(items, "expense");
      const isToday = date === toDateStr(new Date());
      return `
        <section class="day-group">
          <h3 class="day-head">
            <span>${d.getMonth() + 1}月${d.getDate()}日<span class="weekday wd-${d.getDay()}">（${WEEKDAYS[d.getDay()]}）</span>${isToday ? '<span class="today-badge">今日</span>' : ""}</span>
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

function renderItem(entry) {
  return `
    <li class="entry-item ${entry.type}">
      <span class="cat-icon" aria-hidden="true">${iconFor(entry)}</span>
      <div class="entry-content">
        <strong>${escapeHtml(entry.category)}</strong>
        ${entry.memo ? `<span>${escapeHtml(entry.memo)}</span>` : ""}
      </div>
      <span class="entry-amount">${signedYen(entry.type === "income" ? entry.amount : -entry.amount)}</span>
      <button class="delete-btn" data-id="${entry.id}" aria-label="${escapeHtml(entry.category)} ${yen.format(entry.amount)} を削除">
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </li>
  `;
}

function render() {
  monthLabel.textContent = `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`;
  const isCurrent = monthKey(viewMonth) === monthKey(new Date());
  const monthEntries = entriesInViewMonth();
  renderSummary(monthEntries, isCurrent ? "今月の収支" : `${viewMonth.getMonth() + 1}月の収支`);
  renderBreakdown(monthEntries);
  renderList(monthEntries);
}

// 表示中の月が今月なら今日、それ以外はその月の1日を初期値にする
function resetDateInput() {
  const today = new Date();
  dateInput.value = monthKey(today) === monthKey(viewMonth) ? toDateStr(today) : toDateStr(viewMonth);
}

function goToMonth(d) {
  viewMonth = startOfMonth(d);
  resetDateInput();
  render();
}

function showToast(message) {
  toastText.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  toast.classList.remove("is-visible");
  lastDeleted = null;
  setTimeout(() => {
    if (!toast.classList.contains("is-visible")) toast.hidden = true;
  }, 250);
}

typeRadios.forEach((r) => r.addEventListener("change", onTypeChange));

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const amount = Math.round(Number(amountInput.value));
  if (!amount || amount <= 0) return;

  entries.push({
    id: Date.now().toString(),
    type: getSelectedType(),
    date: dateInput.value,
    category: categorySelect.value,
    amount,
    memo: memoInput.value.trim(),
  });
  saveEntries();

  // 登録した日付の月へ移動して、追加結果がすぐ見えるようにする
  viewMonth = startOfMonth(new Date(`${dateInput.value}T00:00:00`));
  amountInput.value = "";
  memoInput.value = "";
  render();
  amountInput.focus();
});

entryGroups.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  const index = entries.findIndex((en) => en.id === btn.dataset.id);
  if (index === -1) return;
  lastDeleted = { entry: entries[index], index };
  entries.splice(index, 1);
  saveEntries();
  render();
  showToast(`「${lastDeleted.entry.category}」を削除しました`);
});

undoBtn.addEventListener("click", () => {
  if (!lastDeleted) return;
  entries.splice(lastDeleted.index, 0, lastDeleted.entry);
  saveEntries();
  render();
  hideToast();
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

document.getElementById("prev-month").addEventListener("click", () => goToMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)));
document.getElementById("next-month").addEventListener("click", () => goToMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)));
monthLabel.addEventListener("click", () => goToMonth(new Date()));

onTypeChange();
resetDateInput();
render();
