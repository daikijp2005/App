// 収支データは配列として持ち、ブラウザの localStorage に保存する
// (サーバーを用意しなくても、次回開いたときにデータが残る)
const STORAGE_KEY = "household-budget";

const CATEGORIES = {
  expense: ["食費", "日用品", "交通費", "住居費", "水道光熱費", "通信費", "交際費", "趣味・娯楽", "医療費", "その他"],
  income: ["給与", "アルバイト", "仕送り", "臨時収入", "その他"],
};

let entries = loadEntries();
let currentFilter = "all";
let viewMonth = startOfMonth(new Date());

const form = document.getElementById("entry-form");
const dateInput = document.getElementById("date");
const categorySelect = document.getElementById("category");
const amountInput = document.getElementById("amount");
const memoInput = document.getElementById("memo");
const typeRadios = form.querySelectorAll('input[name="type"]');
const entryList = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const filterButtons = document.querySelectorAll(".filter-btn");
const statsBox = document.getElementById("stats");
const monthLabel = document.getElementById("month-label");
const breakdownList = document.getElementById("breakdown-list");
const breakdownEmpty = document.getElementById("breakdown-empty");

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

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

function getSelectedType() {
  return form.querySelector('input[name="type"]:checked').value;
}

function fillCategories() {
  const type = getSelectedType();
  categorySelect.innerHTML = CATEGORIES[type]
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function entriesInViewMonth() {
  const key = monthKey(viewMonth);
  return entries.filter((e) => e.date.startsWith(key));
}

function renderStats(monthEntries) {
  const income = monthEntries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const expense = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const balance = income - expense;

  statsBox.innerHTML = `
    <div class="stat stat--income">
      <span class="stat-num">${yen.format(income)}</span>
      <span class="stat-label">収入</span>
    </div>
    <div class="stat stat--expense">
      <span class="stat-num">${yen.format(expense)}</span>
      <span class="stat-label">支出</span>
    </div>
    <div class="stat ${balance < 0 ? "stat--negative" : ""}">
      <span class="stat-num">${yen.format(balance)}</span>
      <span class="stat-label">収支</span>
    </div>
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

  breakdownEmpty.hidden = rows.length > 0;
  breakdownList.innerHTML = rows
    .map(([cat, value]) => {
      const pct = Math.round((value / sum) * 100);
      return `
        <li class="breakdown-row">
          <span class="breakdown-cat">${escapeHtml(cat)}</span>
          <span class="breakdown-bar"><span style="width:${(value / sum) * 100}%"></span></span>
          <span class="breakdown-val">${yen.format(value)}<small>${pct}%</small></span>
        </li>
      `;
    })
    .join("");
}

function renderList(monthEntries) {
  entryList.innerHTML = "";

  const visible = monthEntries
    .filter((e) => currentFilter === "all" || e.type === currentFilter)
    // 新しい日付順、同じ日なら後から登録したものを上に
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  emptyMessage.hidden = monthEntries.length > 0;

  visible.forEach((entry) => {
    const [, m, d] = entry.date.split("-");
    const li = document.createElement("li");
    li.className = `entry-item ${entry.type}`;
    li.innerHTML = `
      <span class="entry-date">${Number(m)}/${Number(d)}</span>
      <div class="entry-content">
        <strong>${escapeHtml(entry.category)}</strong>
        ${entry.memo ? `<span>${escapeHtml(entry.memo)}</span>` : ""}
      </div>
      <span class="entry-amount">${entry.type === "income" ? "+" : "−"}${yen.format(entry.amount)}</span>
      <button class="delete-btn" data-id="${entry.id}" title="削除" aria-label="削除">✕</button>
    `;
    entryList.appendChild(li);
  });
}

function render() {
  monthLabel.textContent = `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`;
  const monthEntries = entriesInViewMonth();
  renderStats(monthEntries);
  renderBreakdown(monthEntries);
  renderList(monthEntries);
}

// 表示中の月が今月なら今日、それ以外はその月の1日を初期値にする
function resetDateInput() {
  const today = new Date();
  dateInput.value = monthKey(today) === monthKey(viewMonth) ? toDateStr(today) : toDateStr(viewMonth);
}

function changeMonth(delta) {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  resetDateInput();
  render();
}

typeRadios.forEach((r) => r.addEventListener("change", fillCategories));

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

entryList.addEventListener("click", (e) => {
  if (!e.target.classList.contains("delete-btn")) return;
  const id = e.target.dataset.id;
  entries = entries.filter((en) => en.id !== id);
  saveEntries();
  render();
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.getElementById("prev-month").addEventListener("click", () => changeMonth(-1));
document.getElementById("next-month").addEventListener("click", () => changeMonth(1));

fillCategories();
resetDateInput();
render();
