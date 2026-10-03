// ふたりの行きたいリスト — 画面側
import { estimateTravel, formatMinutes, formatPrice, relativeDate, priceBucket, travelBucket } from "./util.js";

const $app = document.getElementById("app");
const $modal = document.getElementById("modal-root");
const $toast = document.getElementById("toast-root");

const PLATFORM = {
  instagram: { label: "Instagram", emoji: "📸" }, tiktok: { label: "TikTok", emoji: "🎵" }, x: { label: "X", emoji: "𝕏" },
  youtube: { label: "YouTube", emoji: "▶️" }, threads: { label: "Threads", emoji: "🧵" }, tabelog: { label: "食べログ", emoji: "🍴" },
  googlemaps: { label: "Googleマップ", emoji: "🗺️" }, lemon8: { label: "Lemon8", emoji: "🍋" }, facebook: { label: "Facebook", emoji: "📘" },
  web: { label: "Web", emoji: "🔗" },
};
const STATUS = { want: "行きたい", planned: "予定あり", visited: "行った" };

const state = {
  meta: { genres: [], ai: false },
  room: null,
  me: null,
  baseId: null,
  tab: "list",
  q: "",
  groupBy: "date",
  sortBy: "new",
  genres: new Set(),
  price: "",
  travel: "",
  bothOnly: false,
  addedBy: "",
  map: null,
};

// ---------- 小物 ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(`ikitai.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`ikitai.${k}`, JSON.stringify(v)); } catch { /* プライベートモード等 */ } },
};

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `エラー (${res.status})`), { status: res.status, data });
  return data;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $toast.append(el);
  while ($toast.children.length > 2) $toast.firstElementChild.remove();
  setTimeout(() => el.remove(), 2600);
}

const genre = (id) => state.meta.genres.find((g) => g.id === id) || { id: "other", label: "その他", emoji: "📌" };
const member = (id) => state.room?.members.find((m) => m.id === id) || { name: "?", color: "#999" };
const partner = () => state.room?.members.find((m) => m.id !== state.me);
const activeBase = () => state.room?.bases.find((b) => b.id === state.baseId) || state.room?.bases[0] || null;
const avatar = (m, cls = "") => `<span class="avatar ${cls}" style="background:${esc(m.color)}" title="${esc(m.name)}">${esc([...m.name][0] || "?")}</span>`;
const itemName = (it) => it.placeName || it.title || "名前未設定のスポット";
const likedBy = (it) => Object.keys(it.likes || {}).filter((k) => it.likes[k]);
const isBoth = (it) => state.room.members.every((m) => it.likes?.[m.id]);

function travelOf(it) {
  const base = activeBase();
  if (!base || it.lat == null || it.lng == null) return null;
  return estimateTravel(base, it);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T23:59:59");
  return Math.ceil((d - Date.now()) / 86400000);
}

// ---------- ルーティング ----------
async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  state.meta = await api("/meta").catch(() => state.meta);

  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  // スマホの共有メニューから来たとき（PWA share target）
  if (path === "/share") {
    const shared = [params.get("url"), params.get("text"), params.get("title")].filter(Boolean).join(" ");
    const last = store.get("lastRoom");
    if (last) return location.replace(`/r/${last}?add=${encodeURIComponent(shared)}`);
    store.set("pendingShare", shared);
    return location.replace("/");
  }

  const m = path.match(/^\/r\/([A-Za-z0-9_-]{8,32})/);
  if (!m) return renderWelcome();
  await openRoom(m[1]);
  const add = params.get("add") || store.get("pendingShare");
  if (add) {
    store.set("pendingShare", null);
    history.replaceState(null, "", `/r/${m[1]}`);
    openAdd(add);
  }
}

function renderWelcome() {
  const last = store.get("lastRoom");
  $app.innerHTML = `
    <div class="welcome">
      <img class="logo" src="/icon.svg" alt="">
      <h1>ふたりの行きたいリスト</h1>
      <p>SNSで見つけた「ここ行きたい！」を、恋人とふたりで貯めておく場所。<br>「あれどこ行きたいって言ってたっけ？」をなくそう。</p>
      ${last ? `<a class="btn primary" style="text-decoration:none;margin-top:6px" href="/r/${esc(last)}">前回のリストを開く →</a>` : ""}
      <form id="create">
        <div class="field"><label>リストの名前</label><input name="name" value="ふたりの行きたいリスト" maxlength="40"></div>
        <div class="row2">
          <div class="field"><label>あなたの名前</label><input name="me" placeholder="例: だいき" required maxlength="20"></div>
          <div class="field"><label>恋人の名前</label><input name="partner" placeholder="例: はるか" required maxlength="20"></div>
        </div>
        <button class="btn primary" style="width:100%">ふたりのリストを作る</button>
        <p style="font-size:12px;margin:10px 0 0">作ったあとに表示される招待リンクを恋人に送れば、同じリストを一緒に使えます。</p>
      </form>
      <ul class="features">
        <li>🔗 <b>URLを貼るだけ</b> — Instagram・TikTok・X・食べログなどの投稿から、ジャンル・場所・値段を自動で読み取り</li>
        <li>🚃 <b>移動時間がわかる</b> — 登録した家や職場からの電車・車の目安時間を表示</li>
        <li>🗂️ <b>見やすく整理</b> — ジャンル・エリア・追加日・移動時間・予算でグループ分けと絞り込み</li>
        <li>💞 <b>ふたりとも行きたい</b> — 相手の投稿にも♡。両想いのスポットがひと目でわかる</li>
        <li>🎲 <b>どこ行く？ガチャ</b> — 迷ったら条件をしぼってランダムに決める</li>
        <li>📅 <b>予定・思い出</b> — 行く日を決めて、行ったら★と感想を残せる</li>
      </ul>
    </div>`;
  document.getElementById("create").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      const room = await api("/rooms", { method: "POST", body: { name: f.get("name"), members: [{ name: f.get("me") }, { name: f.get("partner") }] } });
      store.set(`me.${room.id}`, "m1");
      history.pushState(null, "", `/r/${room.id}`);
      await openRoom(room.id);
      openInvite(true);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });
}

async function openRoom(id) {
  try {
    state.room = await api(`/rooms/${id}`);
  } catch (e) {
    $app.innerHTML = `<div class="welcome"><div class="empty"><div class="big">🥲</div><p>${esc(e.message)}</p><a class="btn primary" href="/" style="text-decoration:none">トップへ</a></div></div>`;
    return;
  }
  store.set("lastRoom", id);
  state.me = store.get(`me.${id}`);
  state.baseId = store.get(`base.${id}`);
  Object.assign(state, store.get(`view.${id}`, {}), { genres: new Set(store.get(`view.${id}`, {}).genres || []) });
  document.title = `${state.room.name} | ふたりの行きたいリスト`;
  render();
  listen(id);
  if (!state.me) pickMe();
}

function saveView() {
  const { tab, groupBy, sortBy } = state;
  store.set(`view.${state.room.id}`, { tab, groupBy, sortBy, genres: [...state.genres] });
}

// ---------- リアルタイム同期 ----------
let es = null;
function listen(id) {
  es?.close();
  es = new EventSource(`/api/rooms/${id}/events`);
  es.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.version && msg.version !== state.room.version) await refresh(true);
  };
}

async function refresh(fromRemote = false) {
  const before = new Set(state.room.items.map((i) => i.id));
  state.room = await api(`/rooms/${state.room.id}`);
  if (fromRemote) {
    const added = state.room.items.filter((i) => !before.has(i.id) && i.addedBy !== state.me);
    for (const it of added) toast(`${member(it.addedBy).name}さんが「${itemName(it)}」を追加しました`);
  }
  render();
  const open = $modal.querySelector("[data-detail]");
  if (open) {
    const it = state.room.items.find((i) => i.id === open.dataset.detail);
    if (it && !open.contains(document.activeElement)) openDetail(it.id);
  }
}

// ---------- 絞り込み・並べ替え・グループ分け ----------
function filtered(statusFilter) {
  const q = state.q.trim().toLowerCase();
  let items = state.room.items.filter((it) => (statusFilter ? statusFilter.includes(it.status) : true));
  if (q) items = items.filter((it) => [it.title, it.placeName, it.address, it.station, it.city, it.prefecture, it.memo, it.caption, ...(it.tags || [])].join(" ").toLowerCase().includes(q));
  if (state.genres.size) items = items.filter((it) => state.genres.has(it.genre));
  if (state.price) items = items.filter((it) => priceBucket(it).id === state.price);
  if (state.travel) items = items.filter((it) => travelBucket(travelOf(it)).id === state.travel);
  if (state.bothOnly) items = items.filter(isBoth);
  if (state.addedBy) items = items.filter((it) => it.addedBy === state.addedBy);

  const by = {
    new: (a, b) => b.createdAt.localeCompare(a.createdAt),
    old: (a, b) => a.createdAt.localeCompare(b.createdAt),
    near: (a, b) => (travelOf(a)?.best ?? 1e9) - (travelOf(b)?.best ?? 1e9),
    cheap: (a, b) => (a.priceMin ?? 1e9) - (b.priceMin ?? 1e9),
    love: (a, b) => likedBy(b).length - likedBy(a).length || b.createdAt.localeCompare(a.createdAt),
    deadline: (a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"),
  }[state.sortBy] || ((a, b) => 0);
  items.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b));
  return items;
}

function groupKey(it) {
  switch (state.groupBy) {
    case "genre": { const g = genre(it.genre); return { key: g.id, label: `${g.emoji} ${g.label}`, order: state.meta.genres.findIndex((x) => x.id === g.id) }; }
    case "area": { const a = it.prefecture ? `${it.prefecture}${it.city && !it.city.startsWith(it.prefecture) ? " " + it.city : ""}` : it.city || "エリア未設定"; return { key: a, label: `📍 ${a}`, order: a === "エリア未設定" ? 1e9 : 0 }; }
    case "travel": { const b = travelBucket(travelOf(it)); return { key: b.id, label: b.label, order: b.order }; }
    case "price": { const b = priceBucket(it); return { key: b.id, label: b.label, order: b.order }; }
    case "who": { const m = member(it.addedBy); return { key: it.addedBy, label: `${m.name}が見つけた`, order: it.addedBy === state.me ? 0 : 1 }; }
    case "date": {
      const d = new Date(it.createdAt);
      const days = (Date.now() - d) / 86400000;
      if (days < 7) return { key: "w", label: "🆕 この1週間", order: 0 };
      if (days < 31) return { key: "m", label: "🗓️ この1か月", order: 1 };
      const ym = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      return { key: ym, label: ym, order: 10 + (9999999 - (d.getFullYear() * 100 + d.getMonth())) };
    }
    default: return { key: "all", label: "", order: 0 };
  }
}

function grouped(items) {
  const map = new Map();
  for (const it of items) {
    const g = groupKey(it);
    if (!map.has(g.key)) map.set(g.key, { ...g, items: [] });
    map.get(g.key).items.push(it);
  }
  return [...map.values()].sort((a, b) => a.order - b.order || b.items.length - a.items.length);
}

// ---------- 描画 ----------
function render() {
  const r = state.room;
  const items = r.items;
  const want = items.filter((i) => i.status === "want");
  const counts = {
    list: items.filter((i) => i.status !== "visited").length,
    planned: items.filter((i) => i.status === "planned").length,
    visited: items.filter((i) => i.status === "visited").length,
  };
  const soon = items.filter((i) => i.status !== "visited" && i.deadline && daysUntil(i.deadline) >= 0 && daysUntil(i.deadline) <= 14).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const base = activeBase();

  $app.innerHTML = `
    <header class="topbar"><div class="topbar-inner">
      <div class="brand"><img src="/icon.svg" alt=""><h1>${esc(r.name)}</h1></div>
      <div class="avatars">${r.members.map((m) => avatar(m)).join("")}</div>
      <button class="icon-btn" data-act="invite" title="恋人を招待">💌</button>
      <button class="icon-btn" data-act="settings" title="設定">⚙️</button>
    </div></header>
    <main class="wrap">
      <form class="add-bar" id="add-form">
        <div class="add-row">
          <input id="add-url" type="url" inputmode="url" placeholder="行きたい投稿のURLを貼り付け" autocomplete="off">
          <button type="button" class="btn" data-act="paste" title="クリップボードから貼り付け">📋<span class="label">貼付</span></button>
          <button class="btn primary">読み取る</button>
        </div>
        <p class="hint">Instagram / TikTok / X / YouTube / 食べログ / Googleマップ などのURLに対応。URLがなくても<a href="#" data-act="manual">手入力で追加</a>できます。</p>
      </form>

      <div class="stats">
        <div class="stat"><b>${want.length}</b><span>行きたい</span></div>
        <div class="stat"><b style="color:var(--primary)">${items.filter((i) => i.status !== "visited" && isBoth(i)).length}</b><span>ふたりとも♡</span></div>
        <div class="stat"><b>${counts.planned}</b><span>予定あり</span></div>
        <div class="stat"><b>${counts.visited}</b><span>行った</span></div>
      </div>

      ${soon.map((it) => `<button class="alert" data-open="${it.id}">⏳ <span><b>${esc(itemName(it))}</b> は ${daysUntil(it.deadline) === 0 ? "<b>今日まで</b>" : `あと<b>${daysUntil(it.deadline)}日</b>で終了`}（${esc(it.deadline)}まで）</span></button>`).join("")}

      <div class="toolbar">
        <div class="select" title="移動時間の出発地">
          <select id="base-select">
            ${r.bases.length ? r.bases.map((b) => `<option value="${esc(b.id)}" ${base?.id === b.id ? "selected" : ""}>🏠 ${esc(b.label)}から</option>`).join("") : `<option value="">🏠 出発地を登録</option>`}
            <option value="__add">＋ 出発地を追加・編集</option>
          </select>
        </div>
      </div>

      <nav class="tabs">
        ${[["list", "📋 リスト", counts.list], ["map", "🗺️ マップ", ""], ["planned", "📅 予定", counts.planned], ["visited", "✅ 行った", counts.visited]]
          .map(([id, label, c]) => `<button class="tab ${state.tab === id ? "active" : ""}" data-tab="${id}">${label}${c !== "" ? `<span class="count">${c}</span>` : ""}</button>`).join("")}
      </nav>

      <div id="view"></div>
    </main>
    <button class="fab" data-act="gacha">🎲 どこ行く？</button>`;

  renderView();
}

function filterBar({ showGroup = true } = {}) {
  const r = state.room;
  const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`;
  return `
    <div class="toolbar">
      <div class="search"><input id="q" type="search" placeholder="店名・エリア・メモで検索" value="${esc(state.q)}"></div>
      ${showGroup ? `<div class="select"><select id="group">
        ${opt("date", "🗂️ 追加日ごと", state.groupBy)}${opt("genre", "🗂️ ジャンルごと", state.groupBy)}${opt("area", "🗂️ エリアごと", state.groupBy)}
        ${opt("travel", "🗂️ 移動時間ごと", state.groupBy)}${opt("price", "🗂️ 予算ごと", state.groupBy)}${opt("who", "🗂️ 見つけた人ごと", state.groupBy)}${opt("none", "🗂️ 分けない", state.groupBy)}
      </select></div>` : ""}
      <div class="select"><select id="sort">
        ${opt("new", "↕ 新しい順", state.sortBy)}${opt("old", "↕ 古い順", state.sortBy)}${opt("near", "↕ 近い順", state.sortBy)}
        ${opt("cheap", "↕ 安い順", state.sortBy)}${opt("love", "↕ ♡が多い順", state.sortBy)}${opt("deadline", "↕ 期限が近い順", state.sortBy)}
      </select></div>
    </div>
    <div class="chips">
      <button class="chip ${state.bothOnly ? "on" : ""}" data-chip="both">💞 ふたりとも</button>
      ${r.members.map((m) => `<button class="chip ${state.addedBy === m.id ? "on" : ""}" data-chip="who" data-v="${m.id}">${esc(m.name)}が追加</button>`).join("")}
      ${state.meta.genres.filter((g) => r.items.some((i) => i.genre === g.id)).map((g) => `<button class="chip ${state.genres.has(g.id) ? "on" : ""}" data-chip="genre" data-v="${g.id}">${g.emoji} ${g.label}</button>`).join("")}
    </div>
    <div class="chips">
      ${[["free", "無料"], ["p1", "〜¥1,000"], ["p2", "〜¥3,000"], ["p3", "〜¥5,000"], ["p4", "¥5,000〜"]].map(([v, l]) => `<button class="chip ${state.price === v ? "on" : ""}" data-chip="price" data-v="${v}">💴 ${l}</button>`).join("")}
      ${activeBase() ? [["t30", "〜30分"], ["t60", "〜1時間"], ["t120", "〜2時間"], ["tfar", "遠出"]].map(([v, l]) => `<button class="chip ${state.travel === v ? "on" : ""}" data-chip="travel" data-v="${v}">🚃 ${l}</button>`).join("") : ""}
    </div>`;
}

function card(it) {
  const g = genre(it.genre);
  const t = travelOf(it);
  const p = PLATFORM[it.platform] || PLATFORM.web;
  const adder = member(it.addedBy);
  const area = it.station || it.city || it.prefecture;
  const deadline = it.deadline && it.status !== "visited" ? daysUntil(it.deadline) : null;
  return `
    <article class="card" data-open="${it.id}" tabindex="0">
      <div class="thumb">
        ${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : g.emoji}
        <span class="badge">${g.emoji} ${esc(g.label)}</span>
        ${it.status !== "want" ? `<span class="badge right status-${it.status}">${it.status === "planned" && it.plannedDate ? esc(it.plannedDate.slice(5).replace("-", "/")) + " 予定" : STATUS[it.status]}</span>`
          : deadline != null && deadline >= 0 && deadline <= 30 ? `<span class="badge right" style="background:var(--warn)">あと${deadline}日</span>`
          : it.pinned ? `<span class="badge right">📌</span>` : ""}
      </div>
      <div class="body">
        <h3>${esc(itemName(it))}</h3>
        <div class="meta">
          ${area ? `<span>📍${esc(area)}</span>` : ""}
          ${t ? `<span>🚃<b>${formatMinutes(t.best)}</b></span>` : ""}
          ${formatPrice(it) ? `<span>💴<b>${esc(formatPrice(it))}</b></span>` : ""}
          ${it.status === "visited" && it.rating ? `<span>${"★".repeat(it.rating)}</span>` : ""}
        </div>
        <div class="card-foot">
          <span class="who">${avatar(adder)}<span>${p.emoji} ${relativeDate(it.createdAt)}</span></span>
          <span class="hearts">
            ${isBoth(it) ? `<span class="both">ふたりとも</span>` : ""}
            <button class="heart-btn ${it.likes?.[state.me] ? "on" : ""}" data-like="${it.id}" title="わたしも行きたい">${it.likes?.[state.me] ? "❤️" : "🤍"}</button>
          </span>
        </div>
      </div>
    </article>`;
}

function renderList(items, emptyHtml) {
  if (!items.length) return emptyHtml;
  const groups = state.groupBy === "none" ? [{ label: "", items }] : grouped(items);
  return groups.map((g) => `${g.label ? `<h2 class="group-title">${esc(g.label)} <small>${g.items.length}件</small></h2>` : ""}<div class="grid">${g.items.map(card).join("")}</div>`).join("");
}

function renderView() {
  const $v = document.getElementById("view");
  const anyItems = state.room.items.length > 0;
  const emptyAll = `<div class="empty"><div class="big">🗺️</div><p>まだ何も登録されていません。<br>SNSで「行きたい！」と思った投稿のURLを上に貼り付けてみよう。</p></div>`;
  const emptyFiltered = `<div class="empty"><div class="big">🔍</div><p>条件に合うスポットがありません。</p><button class="btn" data-act="clear">絞り込みを解除</button></div>`;

  if (state.tab === "list") {
    $v.innerHTML = filterBar() + renderList(filtered(["want", "planned"]), anyItems ? emptyFiltered : emptyAll);
  } else if (state.tab === "planned") {
    const items = state.room.items.filter((i) => i.status === "planned").sort((a, b) => (a.plannedDate || "9999").localeCompare(b.plannedDate || "9999"));
    const byMonth = new Map();
    for (const it of items) {
      const k = it.plannedDate ? `${it.plannedDate.slice(0, 4)}年${Number(it.plannedDate.slice(5, 7))}月` : "日にち未定";
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(it);
    }
    $v.innerHTML = items.length
      ? [...byMonth].map(([k, list]) => `<h2 class="group-title">📅 ${esc(k)} <small>${list.length}件</small></h2><div class="grid">${list.map(card).join("")}</div>`).join("")
      : `<div class="empty"><div class="big">📅</div><p>予定はまだありません。<br>スポットを開いて「予定あり」にして日にちを決めよう。</p></div>`;
  } else if (state.tab === "visited") {
    const items = filtered(["visited"]).sort((a, b) => (b.visitedAt || "").localeCompare(a.visitedAt || ""));
    const avg = items.filter((i) => i.rating).reduce((s, i, _, arr) => s + i.rating / arr.length, 0);
    $v.innerHTML = filterBar({ showGroup: false }) +
      (items.length ? `<p class="meta" style="margin:4px 2px 10px">ふたりで行った場所 <b>${items.length}</b>か所${avg ? ` ・ 平均 <b>★${avg.toFixed(1)}</b>` : ""}</p><div class="grid">${items.map(card).join("")}</div>`
        : `<div class="empty"><div class="big">✨</div><p>行った場所はここに思い出として残ります。</p></div>`);
  } else if (state.tab === "map") {
    $v.innerHTML = filterBar({ showGroup: false }) + `<div id="map"></div><p class="meta" style="margin-top:8px">位置がわからないスポットは表示されません。詳細画面の「編集」から住所を入れると地図に出ます。</p>`;
    renderMap();
  }
}

// ---------- 地図（Leaflet） ----------
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.append(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}

async function renderMap() {
  try { await loadLeaflet(); } catch { document.getElementById("map").innerHTML = `<div class="empty">地図を読み込めませんでした</div>`; return; }
  const el = document.getElementById("map");
  if (!el) return;
  const L = window.L;
  const map = L.map(el, { zoomControl: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
  const pts = [];
  const statusColor = { want: "#ff6b8b", planned: "#4f8cff", visited: "#2bb673" };
  for (const it of filtered(["want", "planned", "visited"])) {
    if (it.lat == null || it.lng == null) continue;
    const g = genre(it.genre);
    const icon = L.divIcon({ className: "", html: `<div class="pin" style="background:${statusColor[it.status]}"><span>${g.emoji}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
    const t = travelOf(it);
    L.marker([it.lat, it.lng], { icon }).addTo(map).bindPopup(
      `<div class="map-pop" data-open="${it.id}">${it.image ? `<img src="${esc(it.image)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<b>${esc(itemName(it))}</b><br>${g.emoji} ${esc(g.label)}${t ? ` ・ 🚃${formatMinutes(t.best)}` : ""}${formatPrice(it) ? ` ・ ${esc(formatPrice(it))}` : ""}<br><small>タップで詳細</small></div>`
    );
    pts.push([it.lat, it.lng]);
  }
  for (const b of state.room.bases) {
    L.marker([b.lat, b.lng], { icon: L.divIcon({ className: "", html: `<div class="pin" style="background:#2d2326"><span>🏠</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34] }) }).addTo(map).bindPopup(esc(b.label));
    pts.push([b.lat, b.lng]);
  }
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
  else map.setView([35.681, 139.767], 11);
  map.on("popupopen", (e) => {
    const node = e.popup.getElement()?.querySelector("[data-open]");
    node?.addEventListener("click", () => openDetail(node.dataset.open));
  });
}

// ---------- イベント ----------
$app.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act],[data-tab],[data-chip],[data-like],[data-open]");
  if (!t) return;
  if (t.dataset.like) {
    e.stopPropagation();
    return toggleLike(t.dataset.like);
  }
  if (t.dataset.open) return openDetail(t.dataset.open);
  if (t.dataset.tab) { state.tab = t.dataset.tab; saveView(); return render(); }
  if (t.dataset.chip) {
    const v = t.dataset.v;
    if (t.dataset.chip === "both") state.bothOnly = !state.bothOnly;
    if (t.dataset.chip === "who") state.addedBy = state.addedBy === v ? "" : v;
    if (t.dataset.chip === "genre") state.genres.has(v) ? state.genres.delete(v) : state.genres.add(v);
    if (t.dataset.chip === "price") state.price = state.price === v ? "" : v;
    if (t.dataset.chip === "travel") state.travel = state.travel === v ? "" : v;
    saveView();
    return renderView();
  }
  const act = t.dataset.act;
  if (act === "invite") openInvite();
  if (act === "settings") openSettings();
  if (act === "gacha") openGacha();
  if (act === "manual") { e.preventDefault(); openEditor(blankDraft(), { isNew: true }); }
  if (act === "clear") { Object.assign(state, { q: "", genres: new Set(), price: "", travel: "", bothOnly: false, addedBy: "" }); saveView(); render(); }
  if (act === "paste") {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById("add-url").value = text;
      if (/https?:\/\//.test(text)) openAdd(text);
    } catch { toast("貼り付けできませんでした。長押しで貼り付けてください"); }
  }
});

$app.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches(".card")) openDetail(e.target.dataset.open);
});

$app.addEventListener("submit", (e) => {
  if (e.target.id !== "add-form") return;
  e.preventDefault();
  const v = document.getElementById("add-url").value.trim();
  if (!v) return toast("URLを貼り付けてください");
  openAdd(v);
});

$app.addEventListener("input", (e) => {
  if (e.target.id === "q") {
    state.q = e.target.value;
    clearTimeout(state._qTimer);
    state._qTimer = setTimeout(() => {
      const pos = e.target.selectionStart;
      renderView();
      const q = document.getElementById("q");
      q.focus();
      q.setSelectionRange(pos, pos);
    }, 200);
  }
});

$app.addEventListener("change", (e) => {
  if (e.target.id === "group") { state.groupBy = e.target.value; saveView(); renderView(); }
  if (e.target.id === "sort") { state.sortBy = e.target.value; saveView(); renderView(); }
  if (e.target.id === "base-select") {
    if (e.target.value === "__add" || !e.target.value) return openSettings("bases");
    state.baseId = e.target.value;
    store.set(`base.${state.room.id}`, state.baseId);
    renderView();
  }
});

async function toggleLike(id) {
  const it = state.room.items.find((i) => i.id === id);
  if (!it || !state.me) return pickMe();
  const on = !it.likes?.[state.me];
  it.likes = { ...(it.likes || {}), [state.me]: on };
  if (!on) delete it.likes[state.me];
  render();
  if ($modal.querySelector(`[data-detail="${id}"]`)) openDetail(id);
  await api(`/rooms/${state.room.id}/items/${id}/like`, { method: "POST", body: { memberId: state.me, on } }).catch((err) => toast(err.message));
}

// ---------- モーダル共通 ----------
function modal(html, { onClose, wide } = {}) {
  // 開いたまま中身を差し替えるとき（いいね・コメント後など）はアニメーションしない
  const instant = $modal.firstElementChild ? " instant" : "";
  const prevScroll = $modal.querySelector(".sheet")?.scrollTop || 0;
  $modal.innerHTML = `<div class="overlay${instant}"><div class="sheet" ${wide ? 'style="max-width:760px"' : ""}>${html}</div></div>`;
  if (instant) $modal.querySelector(".sheet").scrollTop = prevScroll;
  const overlay = $modal.firstElementChild;
  const close = () => { $modal.innerHTML = ""; onClose?.(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", function onKey(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } });
  return { root: overlay.firstElementChild, close };
}
const sheetHead = (title) => `<div class="sheet-head"><h2>${title}</h2><button class="close" data-close aria-label="閉じる">✕</button></div>`;

function pickMe() {
  const r = state.room;
  const { root, close } = modal(`
    ${sheetHead("あなたはどっち？")}
    <p class="meta" style="margin-top:-4px">この端末で使う人を選んでください（あとで設定から変えられます）。</p>
    <div class="pick-me">${r.members.map((m) => `<button data-me="${m.id}">${avatar(m)}${esc(m.name)}</button>`).join("")}</div>`);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-me]");
    if (!b) return;
    state.me = b.dataset.me;
    store.set(`me.${r.id}`, state.me);
    close();
    toast(`${member(state.me).name}さん、ようこそ！`);
    render();
  });
}

function inviteUrl() { return `${location.origin}/r/${state.room.id}`; }

function openInvite(first = false) {
  const p = partner();
  const { root } = modal(`
    ${sheetHead(first ? "🎉 リストができました" : "💌 恋人を招待")}
    <p>${p ? `<b>${esc(p.name)}</b>さんに` : ""}このリンクを送ると、同じリストを一緒に見たり追加したりできます。</p>
    <div class="field"><input id="invite-url" readonly value="${esc(inviteUrl())}"></div>
    <div class="actions">
      <button class="btn primary" data-share>LINEなどで送る</button>
      <button class="btn" data-copy>リンクをコピー</button>
    </div>
    <div class="notice" style="margin-top:14px">📱 スマホでは、ブラウザのメニューから<b>「ホーム画面に追加」</b>するとアプリのように使えます。Androidなら、Instagram等の共有ボタンから直接このアプリに送れます。</div>
    <div class="notice">🔒 リンクを知っている人なら誰でも見られるので、ふたり以外には教えないでね。</div>`);
  root.querySelector("[data-copy]").onclick = async () => {
    try { await navigator.clipboard.writeText(inviteUrl()); toast("コピーしました"); } catch { root.querySelector("#invite-url").select(); }
  };
  root.querySelector("[data-share]").onclick = async () => {
    const text = `ふたりの「行きたい」リストを作ったよ！ここに行きたいお店とか貯めていこう💞\n${inviteUrl()}`;
    if (navigator.share) navigator.share({ title: state.room.name, text }).catch(() => {});
    else location.href = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
  };
}

// ---------- 追加 ----------
function blankDraft() {
  return { url: "", platform: "web", title: "", caption: "", image: "", genre: "other", placeName: "", address: "", prefecture: "", city: "", station: "", priceMin: null, priceMax: null, priceNote: "", hours: "", closed: "", tags: [], memo: "", lat: null, lng: null, deadline: "" };
}

async function openAdd(raw) {
  const url = (String(raw).match(/https?:\/\/[^\s<>"'「」]+/) || [])[0];
  if (!url) return openEditor({ ...blankDraft(), caption: raw }, { isNew: true });
  const dup = state.room.items.find((i) => i.url && sameUrl(i.url, url));
  const { root } = modal(`${sheetHead("投稿を読み取り中…")}<div class="loading"><div class="spinner"></div><div>ジャンル・場所・値段を解析しています</div></div>`);
  try {
    const draft = await api("/preview", { method: "POST", body: { url } });
    if (!document.body.contains(root)) return;
    openEditor(draft, { isNew: true, dup });
    const input = document.getElementById("add-url");
    if (input) input.value = "";
  } catch (err) {
    if (!document.body.contains(root)) return;
    openEditor({ ...blankDraft(), url }, { isNew: true, error: err.message });
  }
}

function sameUrl(a, b) {
  const n = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\.|^m\./, "") + x.pathname).replace(/\/$/, ""); } catch { return u; } };
  return n(a) === n(b);
}

function editorFields(d) {
  const opt = (g) => `<option value="${g.id}" ${d.genre === g.id ? "selected" : ""}>${g.emoji} ${g.label}</option>`;
  return `
    <div class="field"><label>スポット名・店名</label><input name="placeName" value="${esc(d.placeName)}" placeholder="例: ○○カフェ 表参道店"></div>
    <div class="field"><label>タイトル（投稿のタイトル）</label><input name="title" value="${esc(d.title)}"></div>
    <div class="row2">
      <div class="field"><label>ジャンル</label><select name="genre">${state.meta.genres.map(opt).join("")}</select></div>
      <div class="field"><label>最寄り駅</label><input name="station" value="${esc(d.station)}" placeholder="例: 表参道駅"></div>
    </div>
    <div class="field"><label>住所・場所 <small>（地図と移動時間に使います）</small></label>
      <div class="add-row"><input name="address" value="${esc(d.address)}" placeholder="例: 東京都渋谷区神宮前…"><button type="button" class="btn small" data-geo>📍位置を検索</button></div>
      <div class="meta" data-geo-status>${d.lat != null ? `📍 位置OK（${Number(d.lat).toFixed(4)}, ${Number(d.lng).toFixed(4)}）${d.geoMatched ? ` ・「${esc(d.geoMatched)}」で検索` : ""}` : "位置未取得（住所か店名を入れて検索してください）"}</div>
    </div>
    <div class="row2">
      <div class="field"><label>都道府県</label><input name="prefecture" value="${esc(d.prefecture)}"></div>
      <div class="field"><label>市区町村</label><input name="city" value="${esc(d.city)}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>値段（下限・円）</label><input name="priceMin" type="number" min="0" inputmode="numeric" value="${d.priceMin ?? ""}"></div>
      <div class="field"><label>値段（上限・円）</label><input name="priceMax" type="number" min="0" inputmode="numeric" value="${d.priceMax ?? ""}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>営業時間・開催期間</label><input name="hours" value="${esc(d.hours)}"></div>
      <div class="field"><label>期限（期間限定の終了日）</label><input name="deadline" type="date" value="${esc(d.deadline || "")}"></div>
    </div>
    <div class="field"><label>メモ（ここが気になる！など）</label><textarea name="memo" placeholder="例: 記念日に行きたい / 予約必須">${esc(d.memo || "")}</textarea></div>`;
}

function readEditor(root, d) {
  const f = Object.fromEntries(new FormData(root.querySelector("form")));
  return { ...d, ...f, priceMin: f.priceMin === "" ? null : Number(f.priceMin), priceMax: f.priceMax === "" ? (f.priceMin === "" ? null : Number(f.priceMin)) : Number(f.priceMax) };
}

function openEditor(draft, { isNew = false, dup = null, error = "", itemId = null } = {}) {
  let d = { ...draft };
  const g = genre(d.genre);
  const p = PLATFORM[d.platform] || PLATFORM.web;
  const { root, close } = modal(`
    ${sheetHead(isNew ? "スポットを追加" : "スポットを編集")}
    ${error ? `<div class="notice warn">⚠️ ${esc(error)}</div>` : ""}
    ${dup ? `<div class="notice warn">👀 この投稿は<b>${esc(member(dup.addedBy).name)}</b>さんが${relativeDate(dup.createdAt)}に登録済みです。<a href="#" data-open-dup="${dup.id}">そちらを開く</a></div>` : ""}
    ${isNew && d.url ? (d.autoRead
      ? `<div class="notice">✨ 投稿を読み取りました${d.aiUsed ? "（AI解析）" : ""}。違うところは直してから追加してね。</div>`
      : `<div class="notice warn">🙏 この投稿は自動で読み取れませんでした（ログインが必要な投稿など）。<br>投稿のキャプションをコピーして下に貼ると、ジャンル・場所・値段を解析します。</div>`) : ""}
    ${d.image ? `<img class="hero-img" src="${esc(d.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    ${d.url ? `<p class="meta" style="margin:-4px 0 10px">${p.emoji} ${p.label}${d.author ? ` ・ ${esc(d.author)}` : ""} ・ <a href="${esc(d.url)}" target="_blank" rel="noopener">元の投稿を開く</a></p>` : ""}
    ${isNew ? `<details ${d.url && !d.autoRead ? "open" : ""} style="margin-bottom:12px"><summary class="meta" style="cursor:pointer">📝 キャプションを貼って解析する</summary>
      <div class="field" style="margin-top:8px"><textarea id="caption-text" placeholder="投稿の本文（📍や住所、値段が書いてある部分）を貼り付け">${esc(d.caption || "")}</textarea></div>
      <button type="button" class="btn small" data-reanalyze>このテキストで解析し直す</button></details>` : ""}
    <form>${editorFields(d)}</form>
    <div class="actions">
      <button class="btn ghost" data-close>キャンセル</button>
      <button class="btn primary" data-save>${isNew ? `${g.emoji} この内容で追加` : "保存"}</button>
    </div>`);

  root.querySelector("[data-open-dup]")?.addEventListener("click", (e) => { e.preventDefault(); openDetail(dup.id); });

  root.querySelector("[data-geo]").onclick = async () => {
    d = readEditor(root, d);
    const status = root.querySelector("[data-geo-status]");
    const q = [d.address, d.placeName && `${d.placeName} ${d.prefecture}${d.city}`.trim(), d.placeName, d.station, `${d.prefecture}${d.city}`].filter((s) => s && s.trim());
    status.textContent = "検索中…";
    for (const query of q) {
      try {
        const r = await api(`/geocode?q=${encodeURIComponent(query)}`);
        d.lat = r.lat; d.lng = r.lng;
        status.textContent = `📍 位置OK：${r.label}`;
        return;
      } catch { /* 次の候補へ */ }
    }
    status.textContent = "見つかりませんでした。住所をもう少し詳しく入れてみてください";
  };

  root.querySelector("[data-reanalyze]")?.addEventListener("click", async (e) => {
    const text = root.querySelector("#caption-text").value.trim();
    if (!text) return toast("テキストを貼り付けてください");
    e.target.disabled = true;
    e.target.textContent = "解析中…";
    try {
      const res = await api("/preview", { method: "POST", body: { text } });
      const cur = readEditor(root, d);
      // 空欄のところだけ解析結果で埋める
      const merged = { ...cur };
      for (const k of ["placeName", "address", "prefecture", "city", "station", "hours", "closed", "priceNote"]) if (!merged[k] && res[k]) merged[k] = res[k];
      if (merged.priceMin == null && res.priceMin != null) { merged.priceMin = res.priceMin; merged.priceMax = res.priceMax; }
      if ((!merged.genre || merged.genre === "other") && res.genre) merged.genre = res.genre;
      if (merged.lat == null && res.lat != null) { merged.lat = res.lat; merged.lng = res.lng; merged.geoMatched = res.geoMatched; }
      merged.tags = [...new Set([...(cur.tags || []), ...(res.tags || [])])];
      merged.caption = text;
      merged.autoRead = true;
      openEditor(merged, { isNew, dup, itemId });
      toast("解析しました");
    } catch (err) {
      toast(err.message);
      e.target.disabled = false;
    }
  });

  root.querySelector("[data-save]").onclick = async (e) => {
    const data = readEditor(root, d);
    if (!data.placeName && !data.title && !data.url) return toast("スポット名かURLを入れてください");
    e.target.disabled = true;
    try {
      if (isNew) {
        const cap = root.querySelector("#caption-text")?.value;
        if (cap) data.caption = cap;
        const created = await api(`/rooms/${state.room.id}/items`, { method: "POST", body: { ...data, addedBy: state.me, allowDuplicate: Boolean(dup) } });
        close();
        toast(`「${itemName(created)}」を追加しました${partner() ? `。${partner().name}さんにも届いてます` : ""}`);
      } else {
        await api(`/rooms/${state.room.id}/items/${itemId}`, { method: "PATCH", body: data });
        toast("保存しました");
        await refresh();
        openDetail(itemId);
        return;
      }
      await refresh();
    } catch (err) {
      if (err.status === 409 && err.data?.item) {
        toast(err.message);
        return openDetail(err.data.item.id);
      }
      toast(err.message);
      e.target.disabled = false;
    }
  };
}

// ---------- 詳細 ----------
function mapsUrl(it) {
  const q = it.lat != null ? `${it.lat},${it.lng}` : [it.placeName, it.address || it.city].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function routeUrl(it, mode) {
  const b = activeBase();
  const dest = it.lat != null ? `${it.lat},${it.lng}` : [it.placeName, it.address].filter(Boolean).join(" ");
  return `https://www.google.com/maps/dir/?api=1&origin=${b ? `${b.lat},${b.lng}` : ""}&destination=${encodeURIComponent(dest)}&travelmode=${mode}`;
}

function openDetail(id) {
  const it = state.room.items.find((i) => i.id === id);
  if (!it) return;
  const g = genre(it.genre);
  const p = PLATFORM[it.platform] || PLATFORM.web;
  const t = travelOf(it);
  const base = activeBase();
  const adder = member(it.addedBy);
  const fmtTime = (iso) => new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const { root, close } = modal(`
    <div data-detail="${it.id}">
    ${sheetHead(`${g.emoji} ${esc(g.label)}`)}
    ${it.image ? `<img class="hero-img" src="${esc(it.image)}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=hero-ph>${g.emoji}</div>'">` : `<div class="hero-ph">${g.emoji}</div>`}
    <h3 class="detail-title">${esc(itemName(it))}</h3>
    ${it.placeName && it.title && it.title !== it.placeName ? `<p class="meta" style="margin:0 0 6px">${esc(it.title)}</p>` : ""}
    <div class="meta" style="align-items:center">
      <span class="who">${avatar(adder)} ${esc(adder.name)}が ${fmtTime(it.createdAt)} に追加</span>
    </div>

    <div class="section-label">行きたい度</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      ${state.room.members.map((m) => `<button class="chip ${it.likes?.[m.id] ? "on" : ""}" ${m.id === state.me ? `data-like="${it.id}"` : "disabled"}>${it.likes?.[m.id] ? "❤️" : "🤍"} ${esc(m.name)}</button>`).join("")}
      ${isBoth(it) ? `<b class="both" style="font-size:13px">💞 ふたりとも行きたい！</b>` : ""}
      <button class="chip ${it.pinned ? "on" : ""}" data-pin>📌 ${it.pinned ? "ピン留め中" : "ピン留め"}</button>
    </div>

    <div class="info">
      <div class="info-row"><span class="ic">📍</span><div class="val">${esc([it.address || [it.prefecture, it.city].join(""), it.station && `${it.station}${it.walkMin ? ` 徒歩${it.walkMin}分` : ""}`].filter(Boolean).join(" ・ ") || "場所未設定")}
        <div><a href="${mapsUrl(it)}" target="_blank" rel="noopener">Googleマップで開く</a></div></div></div>
      <div class="info-row"><span class="ic">🚃</span><div class="val">
        ${t ? `<div class="sub">${esc(base.label)}から（直線 ${t.km.toFixed(1)}km・目安）</div>
          <div class="travel">${t.walk ? `<span>🚶 <b>${formatMinutes(t.walk)}</b></span>` : ""}<span>🚃 <b>${formatMinutes(t.train)}</b></span><span>🚗 <b>${formatMinutes(t.car)}</b></span></div>
          <div><a href="${routeUrl(it, "transit")}" target="_blank" rel="noopener">電車の経路</a> ・ <a href="${routeUrl(it, "driving")}" target="_blank" rel="noopener">車の経路</a></div>`
          : base ? `<span class="sub">位置がわからないため計算できません。「編集」から住所を入れてください。</span>` : `<a href="#" data-base>出発地（家など）を登録</a>すると移動時間がわかります`}
      </div></div>
      <div class="info-row"><span class="ic">💴</span><div class="val">${formatPrice(it) ? esc(formatPrice(it)) : "値段不明"}${it.priceNote && it.priceNote !== "無料" ? ` <span class="sub">${esc(it.priceNote)}</span>` : ""}</div></div>
      ${it.hours || it.closed ? `<div class="info-row"><span class="ic">⏰</span><div class="val">${esc(it.hours)}${it.closed ? `<div class="sub">定休日: ${esc(it.closed)}</div>` : ""}</div></div>` : ""}
      ${it.deadline ? `<div class="info-row"><span class="ic">⏳</span><div class="val">${esc(it.deadline)} まで${daysUntil(it.deadline) >= 0 ? `（あと${daysUntil(it.deadline)}日）` : "（終了）"}</div></div>` : ""}
      ${it.url ? `<div class="info-row"><span class="ic">${p.emoji}</span><div class="val"><a href="${esc(it.url)}" target="_blank" rel="noopener">${p.label}で元の投稿を見る</a>${it.author ? ` <span class="sub">${esc(it.author)}</span>` : ""}</div></div>` : ""}
      ${it.summary ? `<div class="info-row"><span class="ic">💡</span><div class="val">${esc(it.summary)}</div></div>` : ""}
    </div>
    ${it.tags?.length ? `<div class="chips" style="flex-wrap:wrap">${it.tags.map((x) => `<span class="chip">#${esc(x)}</span>`).join("")}</div>` : ""}
    ${it.caption ? `<details><summary class="meta" style="cursor:pointer">投稿の本文を見る</summary><div class="caption">${esc(it.caption)}</div></details>` : ""}

    <div class="section-label">ステータス</div>
    <div class="seg">${Object.entries(STATUS).map(([k, v]) => `<button data-status="${k}" class="${it.status === k ? "on" : ""}">${v}</button>`).join("")}</div>
    ${it.status === "planned" ? `<div class="field" style="margin-top:10px"><label>行く日</label><input type="date" data-field="plannedDate" value="${esc(it.plannedDate || "")}"></div>` : ""}
    ${it.status === "visited" ? `
      <div class="row2" style="margin-top:10px">
        <div class="field"><label>行った日</label><input type="date" data-field="visitedAt" value="${esc(it.visitedAt || "")}"></div>
        <div class="field"><label>評価</label><div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${n}" class="${(it.rating || 0) >= n ? "on" : ""}">⭐</button>`).join("")}</div></div>
      </div>
      <div class="field"><label>感想・思い出</label><textarea data-field="review" placeholder="また行きたい！">${esc(it.review || "")}</textarea></div>` : ""}

    <div class="section-label">メモ</div>
    <div class="field"><textarea data-field="memo" placeholder="予約必須、記念日に、など">${esc(it.memo || "")}</textarea></div>

    <div class="section-label">ふたりのコメント</div>
    <div class="comments">
      ${(it.comments || []).map((c) => { const m = member(c.by); return `<div class="comment ${c.by === state.me ? "mine" : ""}">${avatar(m)}<div class="bubble">${esc(c.text)}<time>${fmtTime(c.at)}</time></div></div>`; }).join("") || `<p class="meta" style="margin:0">「ここいつ行く？」など話そう</p>`}
    </div>
    <form class="comment-form"><input placeholder="コメントを書く" maxlength="500"><button class="btn primary small">送信</button></form>

    <div class="actions">
      <button class="btn" data-edit>✏️ 編集</button>
      <button class="btn" data-share-item>📤 共有</button>
      <button class="btn danger" data-delete>削除</button>
    </div>
    </div>`);

  const patch = async (body, rerender = true) => {
    Object.assign(it, body);
    try {
      await api(`/rooms/${state.room.id}/items/${it.id}`, { method: "PATCH", body });
      await refresh();
      if (rerender) openDetail(it.id);
    } catch (err) { toast(err.message); }
  };

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button,a");
    if (!b) return;
    if (b.dataset.like) return toggleLike(b.dataset.like);
    if (b.hasAttribute("data-pin")) return patch({ pinned: !it.pinned });
    if (b.dataset.status) {
      const body = { status: b.dataset.status };
      if (b.dataset.status === "visited" && !it.visitedAt) body.visitedAt = new Date().toISOString().slice(0, 10);
      if (b.dataset.status === "visited") toast("🎉 思い出に追加しました！");
      return patch(body);
    }
    if (b.dataset.rate) return patch({ rating: Number(b.dataset.rate) });
    if (b.hasAttribute("data-base")) { e.preventDefault(); return openSettings("bases"); }
    if (b.hasAttribute("data-edit")) return openEditor(it, { itemId: it.id });
    if (b.hasAttribute("data-share-item")) {
      const text = `${itemName(it)}\n${it.url || mapsUrl(it)}`;
      if (navigator.share) navigator.share({ title: itemName(it), text }).catch(() => {});
      else { await navigator.clipboard.writeText(text).catch(() => {}); toast("コピーしました"); }
    }
    if (b.hasAttribute("data-delete")) {
      if (!confirm(`「${itemName(it)}」を削除しますか？\n${partner()?.name || "相手"}さんのリストからも消えます。`)) return;
      await api(`/rooms/${state.room.id}/items/${it.id}`, { method: "DELETE" }).catch((err) => toast(err.message));
      close();
      toast("削除しました");
      refresh();
    }
  });

  root.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("change", () => patch({ [el.dataset.field]: el.value }, el.type === "date"));
  });

  root.querySelector(".comment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = e.target.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    if (!state.me) return pickMe();
    input.value = "";
    try {
      await api(`/rooms/${state.room.id}/items/${it.id}/comments`, { method: "POST", body: { memberId: state.me, text } });
      await refresh();
      openDetail(it.id);
    } catch (err) { toast(err.message); }
  });
}

// ---------- どこ行く？ガチャ ----------
function openGacha() {
  const pool0 = state.room.items.filter((i) => i.status !== "visited");
  if (!pool0.length) return toast("まずは行きたい場所を追加しよう");
  const hasBase = Boolean(activeBase());
  const { root, close } = modal(`
    ${sheetHead("🎲 今日どこ行く？")}
    <div class="row2">
      <div class="field"><label>移動時間</label><select name="time" ${hasBase ? "" : "disabled"}>
        <option value="">指定なし</option><option value="30">30分以内</option><option value="60">1時間以内</option><option value="120">2時間以内</option></select></div>
      <div class="field"><label>予算（1人）</label><select name="price">
        <option value="">指定なし</option><option value="0">無料</option><option value="1000">〜¥1,000</option><option value="3000">〜¥3,000</option><option value="5000">〜¥5,000</option></select></div>
    </div>
    <div class="field"><label>ジャンル</label><select name="genre"><option value="">なんでも</option>${state.meta.genres.filter((g) => pool0.some((i) => i.genre === g.id)).map((g) => `<option value="${g.id}">${g.emoji} ${g.label}</option>`).join("")}</select></div>
    <label class="meta" style="display:flex;gap:6px;align-items:center;margin-bottom:10px"><input type="checkbox" name="both"> 💞 ふたりとも♡のところだけ</label>
    <div class="gacha-stage"><div class="dice">🎲</div><div class="slot" id="slot">ボタンを押してね</div></div>
    <div id="gacha-result"></div>
    <div class="actions"><button class="btn primary" data-spin>まわす！</button></div>`);

  root.querySelector("[data-spin]").onclick = () => {
    const f = Object.fromEntries([...root.querySelectorAll("select,input")].map((el) => [el.name, el.type === "checkbox" ? el.checked : el.value]));
    const pool = pool0.filter((it) => {
      if (f.genre && it.genre !== f.genre) return false;
      if (f.both && !isBoth(it)) return false;
      if (f.price !== "" && !(it.priceMin != null && it.priceMin <= Number(f.price))) return false;
      if (f.time) { const t = travelOf(it); if (!t || t.best > Number(f.time)) return false; }
      return true;
    });
    const slot = root.querySelector("#slot");
    const res = root.querySelector("#gacha-result");
    res.innerHTML = "";
    if (!pool.length) { slot.textContent = "条件に合う場所がないよ🥲 条件をゆるめてみて"; return; }
    const dice = root.querySelector(".dice");
    dice.classList.add("rolling");
    let n = 0;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const timer = setInterval(() => {
      slot.textContent = itemName(pool[n++ % pool.length]);
      if (n > 14) {
        clearInterval(timer);
        dice.classList.remove("rolling");
        slot.textContent = `🎉 ${itemName(pick)}`;
        res.innerHTML = `<div class="grid" style="grid-template-columns:1fr">${card(pick)}</div>
          <div class="actions"><button class="btn" data-again>もう一回</button><button class="btn primary" data-plan>ここに決定！予定に入れる</button></div>`;
        res.querySelector("[data-open]").onclick = () => openDetail(pick.id);
        res.querySelector("[data-again]").onclick = () => root.querySelector("[data-spin]").click();
        res.querySelector("[data-plan]").onclick = async () => {
          await api(`/rooms/${state.room.id}/items/${pick.id}`, { method: "PATCH", body: { status: "planned" } });
          await refresh();
          openDetail(pick.id);
          toast("予定に入れました。日にちを決めよう！");
        };
      }
    }, 70 + n * 4);
  };
}

// ---------- 設定 ----------
function openSettings(focus) {
  const r = state.room;
  const { root, close } = modal(`
    ${sheetHead("⚙️ 設定")}
    <div class="section-label">🏠 出発地（移動時間の計算に使います）</div>
    <div id="bases">${r.bases.map((b) => `<div class="base-item"><span>🏠</span><div class="val"><b>${esc(b.label)}</b><div class="sub">${esc(b.address || `${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}`)}</div></div><button class="btn small danger" data-del-base="${esc(b.id)}">削除</button></div>`).join("") || `<p class="meta">まだ登録されていません。ふたりの家や職場、よく待ち合わせる駅などを登録しよう。</p>`}</div>
    <form id="base-form" class="info" style="padding:12px">
      <div class="field"><label>名前</label><input name="label" placeholder="例: わたしの家 / ${esc(partner()?.name || "相手")}の家 / 渋谷駅" required></div>
      <div class="field"><label>住所・駅名</label><input name="address" placeholder="例: 渋谷駅 / 東京都世田谷区…"></div>
      <div class="actions" style="margin-top:0"><button type="button" class="btn" data-here>📍 現在地を使う</button><button class="btn primary">追加</button></div>
      <div class="meta" id="base-status"></div>
    </form>

    <div class="section-label">👫 ふたり</div>
    <form id="room-form">
      <div class="field"><label>リストの名前</label><input name="name" value="${esc(r.name)}" maxlength="40"></div>
      ${r.members.map((m, i) => `<div class="row2"><div class="field"><label>${i ? "ふたりめ" : "ひとりめ"}の名前</label><input name="name${i}" value="${esc(m.name)}" maxlength="20"></div><div class="field"><label>色</label><input name="color${i}" type="color" value="${esc(m.color)}" style="height:46px;padding:4px"></div></div>`).join("")}
      <div class="field"><label>この端末を使っているのは</label><select name="me">${r.members.map((m) => `<option value="${m.id}" ${state.me === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      <button class="btn primary" style="width:100%">保存</button>
    </form>

    <div class="section-label">🧰 その他</div>
    <div class="actions" style="margin-top:0">
      <button class="btn" data-invite>💌 招待リンク</button>
      <a class="btn" href="/api/rooms/${r.id}/export" download style="text-decoration:none">💾 バックアップ</a>
      <button class="btn" data-theme>🌓 テーマ切替</button>
    </div>
    <p class="meta" style="margin-top:12px">投稿の読み取り: ${state.meta.ai ? "AI解析（Claude）＋ルール" : "ルールベース（サーバーに ANTHROPIC_API_KEY を設定するとAI解析になります）"}<br>移動時間は直線距離からの目安です。正確な時間は詳細画面の「経路」から確認できます。</p>`);

  if (focus === "bases") setTimeout(() => root.querySelector("#base-form input").focus(), 50);

  const saveBases = async (bases) => {
    await api(`/rooms/${r.id}`, { method: "PATCH", body: { bases } });
    await refresh();
    openSettings("bases");
  };

  let here = null;
  root.querySelector("[data-here]").onclick = () => {
    const st = root.querySelector("#base-status");
    if (!navigator.geolocation) return (st.textContent = "この端末では現在地を取得できません");
    st.textContent = "現在地を取得中…";
    navigator.geolocation.getCurrentPosition(
      (pos) => { here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; st.textContent = `📍 現在地を取得しました（${here.lat.toFixed(4)}, ${here.lng.toFixed(4)}）`; },
      () => (st.textContent = "現在地を取得できませんでした"),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  root.querySelector("#base-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const st = root.querySelector("#base-status");
    let pos = here;
    if (!pos && f.address) {
      st.textContent = "場所を検索中…";
      try { pos = await api(`/geocode?q=${encodeURIComponent(f.address)}`); } catch { return (st.textContent = "見つかりませんでした。別の書き方で試してください"); }
    }
    if (!pos) return (st.textContent = "住所を入れるか、現在地を使ってください");
    const id = Math.random().toString(36).slice(2, 8);
    if (!state.baseId) { state.baseId = id; store.set(`base.${r.id}`, id); }
    await saveBases([...r.bases, { id, label: f.label, lat: pos.lat, lng: pos.lng, address: f.address || pos.label || "現在地" }]);
    toast("出発地を追加しました");
  };

  root.querySelectorAll("[data-del-base]").forEach((b) => (b.onclick = () => saveBases(r.bases.filter((x) => x.id !== b.dataset.delBase))));

  root.querySelector("#room-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    state.me = f.me;
    store.set(`me.${r.id}`, f.me);
    await api(`/rooms/${r.id}`, { method: "PATCH", body: { name: f.name, members: r.members.map((m, i) => ({ ...m, name: f[`name${i}`], color: f[`color${i}`] })) } });
    close();
    toast("保存しました");
    refresh();
  };
  root.querySelector("[data-invite]").onclick = () => openInvite();
  root.querySelector("[data-theme]").onclick = () => {
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    store.set("theme", document.documentElement.dataset.theme);
  };
}

// ---------- 起動 ----------
const savedTheme = store.get("theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
window.addEventListener("popstate", () => location.reload());
boot();

