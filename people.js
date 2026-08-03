// 人のメモは配列として持ち、ブラウザの localStorage に保存する
const STORAGE_KEY = "people";
const RELATION_ICONS = {
  "家族": "👨‍👩‍👧",
  "友人": "🧑‍🤝‍🧑",
  "恋人": "💗",
  "先輩・後輩": "🎓",
  "職場": "💼",
  "その他": "🌱",
};

let people = load();

const form = document.getElementById("entry-form");
const nameInput = document.getElementById("name-input");
const relationInput = document.getElementById("relation-input");
const noteInput = document.getElementById("note-input");
const dateInput = document.getElementById("date-input");
const list = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const statsBox = document.getElementById("stats");

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// 次に来る誕生日までの日数（今年の分をもう過ぎていれば来年扱い）
function daysUntilBirthday(dateStr) {
  const [, mm, dd] = dateStr.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), mm - 1, dd);
  if (next < today) next = new Date(today.getFullYear() + 1, mm - 1, dd);
  return Math.round((next - today) / 86400000);
}

function renderStats() {
  const withBirthday = people.filter((p) => p.specialDate);
  const upcoming = withBirthday.filter((p) => daysUntilBirthday(p.specialDate) <= 30).length;

  statsBox.innerHTML = `
    <div class="stat stat--accent">
      <span class="stat-num">${people.length}</span>
      <span class="stat-label">登録人数</span>
    </div>
    <div class="stat">
      <span class="stat-num">${withBirthday.length}</span>
      <span class="stat-label">誕生日登録済み</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${upcoming}</span>
      <span class="stat-label">30日以内の誕生日</span>
    </div>
  `;
}

function render() {
  renderStats();
  list.innerHTML = "";
  emptyMessage.hidden = people.length > 0;

  const sorted = people.slice().sort((a, b) => {
    const da = a.specialDate ? daysUntilBirthday(a.specialDate) : 999;
    const db = b.specialDate ? daysUntilBirthday(b.specialDate) : 999;
    return da - db;
  });

  sorted.forEach((person) => {
    const li = document.createElement("li");
    li.className = "entry-item";

    let dateLabel = "";
    if (person.specialDate) {
      const days = daysUntilBirthday(person.specialDate);
      const [, mm, dd] = person.specialDate.split("-");
      dateLabel = days === 0 ? ` ・ 🎂 今日誕生日！` : ` ・ 🎂 ${mm}/${dd}（あと${days}日）`;
    }

    li.innerHTML = `
      <div class="entry-content">
        <strong>${RELATION_ICONS[person.relation] || "🌱"} ${escapeHtml(person.name)}</strong>
        <span>${escapeHtml(person.note || "")}${dateLabel}</span>
      </div>
      <span class="entry-tag">${escapeHtml(person.relation)}</span>
      <button class="delete-btn" data-id="${person.id}" title="削除">✕</button>
    `;
    list.appendChild(li);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  people.push({
    id: Date.now().toString(),
    name: nameInput.value.trim(),
    relation: relationInput.value,
    note: noteInput.value.trim(),
    specialDate: dateInput.value || null,
  });

  save();
  render();
  form.reset();
  nameInput.focus();
});

list.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  people = people.filter((p) => p.id !== id);
  save();
  render();
});

render();
