// Webアプリ版の入り口：部屋（ふたりのリスト）の作成・招待リンク・サーバーとの同期を受け持ち、画面は core.js に任せる
import { startApp } from "./core.js";

const local = {
  get(k, d = null) { try { const v = localStorage.getItem(`ikitai.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`ikitai.${k}`, JSON.stringify(v)); } catch { /* 覚えられない環境 */ } },
};

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `うまくいきませんでした (${res.status})`), { status: res.status, data });
  return data;
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1]);
  r.onerror = reject;
  r.readAsDataURL(file);
});

function webBackend(room, meta) {
  let current = room;
  let listener = () => {};
  const emit = () => listener({ settings: { name: current.name, bases: current.bases }, spots: current.items });
  const refresh = async () => { current = await api(`/rooms/${room.id}`); emit(); };
  const id = room.id;
  return {
    kind: "web",
    features: { map: true, thumbnails: true, aiButton: false, aiImage: meta.ai, ics: true, invite: true, members: true, export: true, clipboardRead: Boolean(navigator.clipboard?.readText), geolocation: "geolocation" in navigator },
    readerNote: meta.ai ? "リンク先を開いて読み取り、AI（Claude）で整理しています" : "リンク先を開いてルールで読み取っています（サーバーに ANTHROPIC_API_KEY を設定するとAIで読み取ります）",
    subscribe(fn) {
      listener = fn;
      emit();
      const es = new EventSource(`/api/rooms/${id}/events`);
      es.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.version && m.version !== current.version) refresh().catch(() => {}); };
    },
    me: () => local.get(`me.${id}`),
    setMe: (m) => local.set(`me.${id}`, m),
    needsPick: () => !local.get(`me.${id}`),
    people: () => current.members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    async addSpot(body) { const r = await api(`/rooms/${id}/items`, { method: "POST", body: { ...body, addedBy: local.get(`me.${id}`), allowDuplicate: true } }); await refresh(); return r; },
    async updateSpot(itemId, patch) { await api(`/rooms/${id}/items/${itemId}`, { method: "PATCH", body: patch }); await refresh(); },
    async deleteSpot(itemId) { await api(`/rooms/${id}/items/${itemId}`, { method: "DELETE" }); await refresh(); },
    async vote(itemId, value) { await api(`/rooms/${id}/items/${itemId}/like`, { method: "POST", body: { memberId: local.get(`me.${id}`), value } }); await refresh(); },
    async comment(itemId, text) { await api(`/rooms/${id}/items/${itemId}/comments`, { method: "POST", body: { memberId: local.get(`me.${id}`), text } }); await refresh(); },
    async saveSettings(patch) { await api(`/rooms/${id}`, { method: "PATCH", body: patch }); await refresh(); },
    async saveMembers(members) { await api(`/rooms/${id}`, { method: "PATCH", body: { members } }); await refresh(); },
    async readPost({ url, text, image }) {
      const body = { url, text };
      if (image) { body.image = await fileToBase64(image); body.mediaType = image.type || "image/jpeg"; }
      const draft = await api("/preview", { method: "POST", body });
      if (draft.geoMatched) draft.geoNote = `「${draft.geoMatched}」の位置`;
      if (draft.url && !draft.autoRead && draft.warnings?.length) draft.error = "リンク先を開けませんでした（ログインが必要な投稿など）。本文を貼ると読み取れます。";
      return draft;
    },
    async locate(q) { try { return await api(`/geocode?q=${encodeURIComponent(q)}`); } catch { return null; } },
    inviteUrl: () => `${location.origin}/r/${id}`,
    exportUrl: () => `/api/rooms/${id}/export`,
  };
}

const LOGO = `<svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="128" fill="var(--rose)"/><path d="M256 96c-69 0-124 54-124 122 0 90 124 198 124 198s124-108 124-198c0-68-55-122-124-122z" fill="var(--surface)"/><path d="M256 258c-6-5-56-41-56-75 0-18 14-33 32-33 10 0 19 5 24 12 5-7 14-12 24-12 18 0 32 15 32 33 0 34-50 70-56 75z" fill="var(--rose)"/></svg>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function welcome() {
  const last = local.get("lastRoom");
  document.body.innerHTML = `<div class="welcome">${LOGO}
    <h1>ふたりの行きたいリスト</h1>
    <p>SNSで見つけた「ここ行きたい！」を、恋人とふたりで貯めておく場所。<br>「あれどこ行きたいって言ってたっけ？」をなくします。</p>
    ${last ? `<a class="btn rose" href="/r/${esc(last)}">前回のリストを開く</a>` : ""}
    <form id="create">
      <div class="field"><label for="w-me">あなたの名前</label><input id="w-me" name="me" required maxlength="20" placeholder="例: だいき"></div>
      <div class="field"><label for="w-partner">恋人の名前</label><input id="w-partner" name="partner" required maxlength="20" placeholder="例: はるか"></div>
      <button class="btn rose block">ふたりのリストを作る</button>
      <p class="sub" style="margin:10px 0 0">作ったあと、招待リンクを恋人に送れば一緒に使えます。恋人はアカウント登録なしで使えます。</p>
    </form>
    <ul class="features">
      <li><b>リンクを貼るだけ</b><br><span class="sub">Instagram・TikTok・X・食べログなどから、ジャンル・場所・値段を読み取り</span></li>
      <li><b>答え合わせ</b><br><span class="sub">相手が見つけた場所を左右にスワイプ。ふたりとも行きたいと「マッチ」</span></li>
      <li><b>デートコースを自動で</b><br><span class="sub">ふたりの「行きたい」から、近い場所どうしを回る順番と時間割を作成</span></li>
      <li><b>いまのおすすめ</b><br><span class="sub">期間限定の締め切り・今が旬・いま営業中の場所をお知らせ</span></li>
      <li><b>ふたりの足あと</b><br><span class="sub">行った場所を都道府県マップと思い出の記録に</span></li>
    </ul></div>`;
  document.getElementById("create").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      const room = await api("/rooms", { method: "POST", body: { members: [{ name: f.get("me") }, { name: f.get("partner") }] } });
      local.set(`me.${room.id}`, "m1");
      location.href = `/r/${room.id}?welcome=1`;
    } catch (err) {
      btn.disabled = false;
      alert(err.message);
    }
  });
}

async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  const theme = local.get("theme");
  if (theme) document.documentElement.dataset.theme = theme;
  const params = new URLSearchParams(location.search);

  // スマホの共有メニュー（PWA）から来たとき
  if (location.pathname === "/share") {
    const shared = [params.get("url"), params.get("text"), params.get("title")].filter(Boolean).join(" ");
    const last = local.get("lastRoom");
    location.replace(last ? `/r/${last}?add=${encodeURIComponent(shared)}` : "/");
    return;
  }
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{8,32})/);
  if (!m) return welcome();
  let room, meta;
  try { [room, meta] = await Promise.all([api(`/rooms/${m[1]}`), api("/meta")]); }
  catch (e) {
    document.body.innerHTML = `<div class="welcome">${LOGO}<h1>リストが見つかりません</h1><p>${esc(e.message)}</p><a class="btn rose" href="/">トップへ</a></div>`;
    return;
  }
  local.set("lastRoom", room.id);
  const app = startApp(webBackend(room, meta));
  const add = params.get("add");
  if (params.has("add") || params.has("welcome")) history.replaceState(null, "", `/r/${room.id}`);
  if (add) setTimeout(() => app.openAdd(add), 300);
  if (params.has("welcome")) setTimeout(() => document.querySelector("[data-act=settings]")?.click(), 400);
}

boot();
