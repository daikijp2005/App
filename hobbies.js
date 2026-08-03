// 好きなもの一覧は配列として持ち、ブラウザの localStorage に保存する
const STORAGE_KEY = "hobbies";
const CATEGORY_ICONS = {
  "音楽": "🎵",
  "映画・アニメ": "🎬",
  "ゲーム": "🎮",
  "食べ物": "🍜",
  "スポーツ": "⚽",
  "その他": "✨",
};

let hobbies = load();

const form = document.getElementById("entry-form");
const nameInput = document.getElementById("name-input");
const categoryInput = document.getElementById("category-input");
const noteInput = document.getElementById("note-input");
const ratingInput = document.getElementById("rating-input");
const list = document.getElementById("entry-list");
const emptyMessage = document.getElementById("empty-message");
const statsBox = document.getElementById("stats");

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hobbies));
}

// XSS対策: ユーザー入力をそのままHTMLに埋め込まないようエスケープする
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function stars(rating) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function renderStats() {
  const categories = new Set(hobbies.map((h) => h.category));
  const avg = hobbies.length
    ? (hobbies.reduce((sum, h) => sum + h.rating, 0) / hobbies.length).toFixed(1)
    : "0.0";

  statsBox.innerHTML = `
    <div class="stat stat--accent">
      <span class="stat-num">${hobbies.length}</span>
      <span class="stat-label">登録件数</span>
    </div>
    <div class="stat">
      <span class="stat-num">${categories.size}</span>
      <span class="stat-label">カテゴリ数</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${avg}</span>
      <span class="stat-label">平均お気に入り度</span>
    </div>
  `;
}

function render() {
  renderStats();
  list.innerHTML = "";
  emptyMessage.hidden = hobbies.length > 0;

  const sorted = hobbies.slice().sort((a, b) => b.rating - a.rating);

  sorted.forEach((hobby) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-content">
        <strong>${CATEGORY_ICONS[hobby.category] || "✨"} ${escapeHtml(hobby.name)}</strong>
        <span>${stars(hobby.rating)}${hobby.note ? ` ・ ${escapeHtml(hobby.note)}` : ""}</span>
      </div>
      <span class="entry-tag">${escapeHtml(hobby.category)}</span>
      <button class="delete-btn" data-id="${hobby.id}" title="削除">✕</button>
    `;
    list.appendChild(li);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  hobbies.push({
    id: Date.now().toString(),
    name: nameInput.value.trim(),
    category: categoryInput.value,
    note: noteInput.value.trim(),
    rating: Number(ratingInput.value),
  });

  save();
  render();
  form.reset();
  nameInput.focus();
});

list.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  hobbies = hobbies.filter((h) => h.id !== id);
  save();
  render();
});

render();
