// シフトは配列として持ち、ブラウザの localStorage に保存する
const STORAGE_KEY = "arbeitShifts";

let shifts = load();

const form = document.getElementById("entry-form");
const dateInput = document.getElementById("date-input");
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const wageInput = document.getElementById("wage-input");
const noteInput = document.getElementById("note-input");
const list = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const statsBox = document.getElementById("stats");
const calendarEl = document.getElementById("calendar");

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts));
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function hours(shift) {
  const [sh, sm] = shift.start.split(":").map(Number);
  const [eh, em] = shift.end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

function earnings(shift) {
  return hours(shift) * shift.wage;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
}

function renderStats() {
  const monthKey = currentMonthKey();
  const thisMonth = shifts.filter((s) => s.date.slice(0, 7) === monthKey);
  const totalEarnings = thisMonth.reduce((sum, s) => sum + earnings(s), 0);
  const totalHours = thisMonth.reduce((sum, s) => sum + hours(s), 0);

  statsBox.innerHTML = `
    <div class="stat stat--accent">
      <span class="stat-num">¥${Math.round(totalEarnings).toLocaleString()}</span>
      <span class="stat-label">今月の収入</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${totalHours.toFixed(1)}</span>
      <span class="stat-label">今月の勤務時間</span>
    </div>
    <div class="stat">
      <span class="stat-num">${thisMonth.length}</span>
      <span class="stat-label">今月のシフト数</span>
    </div>
  `;
}

function renderCal() {
  renderCalendar(
    calendarEl,
    shifts.map((s) => ({
      date: s.date,
      label: `${s.start}〜${s.end} ・ ¥${Math.round(earnings(s)).toLocaleString()}${s.note ? " ・ " + s.note : ""}`,
    }))
  );
}

function render() {
  renderStats();
  renderCal();
  list.innerHTML = "";
  emptyMessage.hidden = shifts.length > 0;

  const sorted = shifts.slice().sort((a, b) => b.date.localeCompare(a.date));

  sorted.forEach((shift) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-content">
        <strong>${shift.date}</strong>
        <span>${shift.start}〜${shift.end}（${hours(shift).toFixed(1)}時間）${shift.note ? " ・ " + escapeHtml(shift.note) : ""}</span>
      </div>
      <span class="entry-tag entry-tag--pay">¥${Math.round(earnings(shift)).toLocaleString()}</span>
      <button class="delete-btn" data-id="${shift.id}" title="削除">✕</button>
    `;
    list.appendChild(li);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  shifts.push({
    id: Date.now().toString(),
    date: dateInput.value,
    start: startInput.value,
    end: endInput.value,
    wage: Number(wageInput.value),
    note: noteInput.value.trim(),
  });

  save();
  render();
  form.reset();
  dateInput.focus();
});

list.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  shifts = shifts.filter((s) => s.id !== id);
  save();
  render();
});

render();
