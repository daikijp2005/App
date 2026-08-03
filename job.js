// 就活の進捗は配列として持ち、ブラウザの localStorage に保存する
const STORAGE_KEY = "jobHunting";

let companies = load();

const form = document.getElementById("entry-form");
const companyInput = document.getElementById("company-input");
const stageInput = document.getElementById("stage-input");
const noteInput = document.getElementById("note-input");
const nextDateInput = document.getElementById("next-date-input");
const list = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const statsBox = document.getElementById("stats");
const calendarEl = document.getElementById("calendar");

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(companies));
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function renderStats() {
  const active = companies.filter((c) => c.stage !== "内定" && c.stage !== "見送り");
  const offers = companies.filter((c) => c.stage === "内定");
  const soon = companies.filter((c) => c.nextDate && daysUntil(c.nextDate) >= 0 && daysUntil(c.nextDate) <= 7);

  statsBox.innerHTML = `
    <div class="stat stat--accent">
      <span class="stat-num">${active.length}</span>
      <span class="stat-label">選考中</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${soon.length}</span>
      <span class="stat-label">7日以内に予定</span>
    </div>
    <div class="stat">
      <span class="stat-num">${offers.length}</span>
      <span class="stat-label">内定</span>
    </div>
  `;
}

function renderCal() {
  renderCalendar(
    calendarEl,
    companies
      .filter((c) => c.nextDate)
      .map((c) => ({ date: c.nextDate, label: `${c.company}（${c.stage}）` }))
  );
}

function render() {
  renderStats();
  renderCal();
  list.innerHTML = "";
  emptyMessage.hidden = companies.length > 0;

  const sorted = companies.slice().sort((a, b) => {
    const da = a.nextDate ? daysUntil(a.nextDate) : 999;
    const db = b.nextDate ? daysUntil(b.nextDate) : 999;
    return da - db;
  });

  sorted.forEach((company) => {
    const li = document.createElement("li");
    const stageClass = company.stage === "内定" ? "stage-offer" : company.stage === "見送り" ? "stage-declined" : "";
    li.className = `entry-item ${stageClass}`;

    let dateLabel = "";
    if (company.nextDate) {
      const d = daysUntil(company.nextDate);
      dateLabel = ` ・ ${company.nextDate}（${d === 0 ? "今日" : d > 0 ? `あと${d}日` : `${-d}日前`}）`;
    }

    li.innerHTML = `
      <div class="entry-content">
        <strong>${escapeHtml(company.company)}</strong>
        <span>${escapeHtml(company.note || "")}${dateLabel}</span>
      </div>
      <span class="entry-tag">${escapeHtml(company.stage)}</span>
      <button class="delete-btn" data-id="${company.id}" title="削除">✕</button>
    `;
    list.appendChild(li);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  companies.push({
    id: Date.now().toString(),
    company: companyInput.value.trim(),
    stage: stageInput.value,
    note: noteInput.value.trim(),
    nextDate: nextDateInput.value || null,
  });

  save();
  render();
  form.reset();
  companyInput.focus();
});

list.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  companies = companies.filter((c) => c.id !== id);
  save();
  render();
});

render();
