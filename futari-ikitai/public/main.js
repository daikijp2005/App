// Webアプリ版の入り口：リストの作成・参加・切り替えと、サーバーとの同期を受け持ち、画面は core.js に任せる
import { startApp, showOnboarding, applyAccent } from "./core.js";
import { GROUP_TYPES } from "./smart.js";

const local = {
  get(k, d = null) { try { const v = localStorage.getItem(`ikitai.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`ikitai.${k}`, JSON.stringify(v)); } catch { /* 覚えられない環境 */ } },
};

// この端末で開いたことのあるリスト（切り替え用）
const lists = {
  all: () => local.get("lists", []),
  remember(room) {
    const rest = lists.all().filter((l) => l.id !== room.id);
    local.set("lists", [{ id: room.id, name: room.name, type: room.type || "couple", count: room.items?.length ?? null, members: (room.members || []).slice(0, 50).map((m) => ({ id: m.id, name: m.name, color: m.color })), at: Date.now() }, ...rest].slice(0, 30));
    local.set("lastRoom", room.id);
  },
  forget(id) {
    local.set("lists", lists.all().filter((l) => l.id !== id));
    if (local.get("lastRoom") === id) local.set("lastRoom", lists.all()[0]?.id || null);
  },
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
  const id = room.id;
  const emit = () => listener({ settings: { name: current.name, type: current.type || "couple", bases: current.bases }, spots: current.items });
  const refresh = async () => { current = await api(`/rooms/${id}`); lists.remember(current); emit(); };
  const meId = () => { const m = local.get(`me.${id}`); return current.members.some((x) => x.id === m) ? m : null; };
  return {
    kind: "web",
    features: { map: true, thumbnails: true, aiButton: meta.ai, aiRead: meta.ai, codes: true, askAI: meta.ai, routeAI: meta.ai, aiImage: meta.ai, ics: true, invite: true, members: true, memberList: true, lists: true, export: true, clipboardRead: Boolean(navigator.clipboard?.readText), geolocation: "geolocation" in navigator },
    readerNote: meta.ai ? "リンク先を開いて読み取り、AI（Claude）で整理しています" : "リンク先を開いてルールで読み取っています（サーバーに ANTHROPIC_API_KEY を設定するとAIで読み取ります）",
    subscribe(fn) {
      listener = fn;
      emit();
      const es = new EventSource(`/api/rooms/${id}/events`);
      es.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.version && m.version !== current.version) refresh().catch(() => {}); };
    },
    me: meId,
    setMe: (m) => local.set(`me.${id}`, m),
    people: () => current.members.map((m) => ({ id: m.id, name: m.name, color: m.color, avatar: m.avatar || "" })),
    renameMember: (memberId, name) => api(`/rooms/${id}`, { method: "PATCH", body: { members: [{ id: memberId, name }] } }).then(refresh),
    setAvatar: (memberId, avatar) => api(`/rooms/${id}`, { method: "PATCH", body: { members: [{ id: memberId, avatar }] } }).then(refresh),
    async join(name) { const m = await api(`/rooms/${id}/members`, { method: "POST", body: { name } }); local.set(`me.${id}`, m.id); await refresh(); return m; },
    async leave() {
      await api(`/rooms/${id}/members/${meId()}`, { method: "DELETE" });
      local.set(`me.${id}`, null);
      lists.forget(id);
      const next = lists.all()[0];
      location.href = next ? `/r/${next.id}` : "/";
    },
    async addSpot(body) { const r = await api(`/rooms/${id}/items`, { method: "POST", body: { ...body, addedBy: meId(), allowDuplicate: true } }); await refresh(); return r; },
    async updateSpot(itemId, patch) { await api(`/rooms/${id}/items/${itemId}`, { method: "PATCH", body: patch }); await refresh(); },
    async deleteSpot(itemId) { await api(`/rooms/${id}/items/${itemId}`, { method: "DELETE" }); await refresh(); },
    async vote(itemId, value, reason = null) { await api(`/rooms/${id}/items/${itemId}/like`, { method: "POST", body: { memberId: meId(), value, reason } }); await refresh(); },
    route: (q) => api("/route", { method: "POST", body: q }),
    async comment(itemId, text) { await api(`/rooms/${id}/items/${itemId}/comments`, { method: "POST", body: { memberId: meId(), text } }); await refresh(); },
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
    async ask(q) { const r = await api(`/rooms/${id}/ask`, { method: "POST", body: { q } }); return r.picks || []; },
    async locate(q) { try { return await api(`/geocode?q=${encodeURIComponent(q)}`); } catch { return null; } },
    lists: () => lists.all().map((l) => ({ ...l, url: `/r/${l.id}`, current: l.id === id, members: l.id === id ? current.members.map((m) => ({ id: m.id, name: m.name, color: m.color, avatar: m.avatar || "" })) : l.members || [] })),
    newListUrl: () => "/new",
    shareCode: async () => current.code || "",
    async joinByCode(code) {
      const g = await api(`/join/${encodeURIComponent(code)}`);
      location.href = `/r/${g.id}`;
      return g;
    },
    inviteUrl: () => `${location.origin}/r/${id}`,
    exportUrl: () => `/api/rooms/${id}/export`,
  };
}

const LOGO = `<svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="128" fill="var(--rose)"/><path d="M256 92c-70 0-126 55-126 124 0 92 126 204 126 204s126-112 126-204c0-69-56-124-126-124z" fill="var(--surface)"/><path d="M220 196c0-22 16-38 37-38s37 15 37 35c0 27-37 29-37 56" fill="none" stroke="var(--rose)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><circle cx="257" cy="292" r="16" fill="var(--rose)"/></svg>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- リストを作る（誰と使う？ → 名前） ----------
function createFlow() {
  const known = lists.all();
  let type = null;
  const stepType = () => {
    document.body.innerHTML = `<div class="welcome">${LOGO}
      <p class="brand-line"><b>Spotrip</b>行きたい場所、もう忘れない。</p>
      <div class="steps-bar"><i class="on"></i><i></i></div>
      <h1>誰と使いますか？</h1>
      <p>使う相手ごとにリストを作れます。あとから設定で変えられます。</p>
      <div class="type-grid" style="margin-top:18px">${Object.entries(GROUP_TYPES).map(([k, t]) => `<button class="type-tile" data-type="${k}"><span class="emoji">${t.emoji}</span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join("")}</div>
      <form id="join-code" class="panel" style="margin-top:16px;text-align:left">
        <b>招待コードで参加する</b><p class="sub" style="margin:2px 0 8px">誘ってくれた人から聞いた6文字のコードを入れてください。</p>
        <div style="display:flex;gap:6px"><input id="jc" maxlength="12" placeholder="例: K7M2QX" autocomplete="off" style="flex:1;min-width:0;border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--bg);text-transform:uppercase;letter-spacing:.15em;font-weight:700"><button class="btn rose">参加</button></div>
        <p class="sub" id="jc-status" style="margin:6px 0 0"></p>
      </form>
      ${known.length ? `<div class="label" style="text-align:left">開いたことのあるリスト</div><div class="panel" style="text-align:left;padding:4px 14px">${known.map((l) => `<a class="memory" href="/r/${esc(l.id)}" style="text-decoration:none;color:inherit;grid-template-columns:40px 1fr;align-items:center"><span class="ph" style="width:40px;height:40px;font-size:20px">${(GROUP_TYPES[l.type] || GROUP_TYPES.friends).emoji}</span><span><b>${esc(l.name)}</b><div class="sub">${esc((GROUP_TYPES[l.type] || GROUP_TYPES.friends).label)}</div></span></a>`).join("")}</div>` : ""}
      <p class="sub" style="margin-top:18px"><a href="#" data-tour>使い方をもう一度見る</a></p></div>`;
    document.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => { type = b.dataset.type; stepName(); }));
    document.getElementById("join-code").addEventListener("submit", async (e) => {
      e.preventDefault();
      const st = document.getElementById("jc-status");
      st.textContent = "探しています…";
      try { const g = await api(`/join/${encodeURIComponent(document.getElementById("jc").value)}`); location.href = `/r/${g.id}`; }
      catch (err) { st.textContent = err.message; }
    });
    document.querySelector("[data-tour]").addEventListener("click", (e) => { e.preventDefault(); showOnboarding(() => {}); });
  };
  const stepName = () => {
    const t = GROUP_TYPES[type];
    document.body.innerHTML = `<div class="welcome">${LOGO}
      <div class="steps-bar"><i class="on"></i><i class="on"></i></div>
      <h1>${t.emoji} ${esc(t.label)}と使うリスト</h1>
      <form id="create">
        <div class="field"><label for="w-list">リストの名前</label><input id="w-list" name="list" required maxlength="40" value="${esc(t.listName)}"></div>
        <div class="field"><label for="w-me">あなたの名前</label><input id="w-me" name="me" required maxlength="20" placeholder="例: だいき" autocomplete="nickname" ${type === "solo" ? 'value="わたし"' : ""}></div>
        <button class="btn rose block">リストを作る</button>
        <p class="sub" style="margin:10px 0 0">${type === "solo" ? "あとから人を招待して一緒に使うこともできます。" : "作ったあと、招待リンクを送れば一緒に使えます。相手はアカウント登録なしで、名前を入れるだけで参加できます。"}</p>
      </form>
      <button class="btn line" style="margin-top:14px" data-back>戻る</button></div>`;
    document.querySelector("[data-back]").addEventListener("click", stepType);
    document.getElementById("create").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector("button");
      btn.disabled = true;
      try {
        const room = await api("/rooms", { method: "POST", body: { type, name: f.get("list"), members: [{ name: f.get("me") }] } });
        local.set(`me.${room.id}`, "m1");
        lists.remember(room);
        location.href = `/r/${room.id}${type === "solo" ? "" : "?invite=1"}`;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = err.message;
      }
    });
    setTimeout(() => document.getElementById("w-me")?.focus(), 60);
  };
  stepType();
}

async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  const theme = local.get("theme");
  if (theme) document.documentElement.dataset.theme = theme;
  applyAccent(local.get("accent", ""));
  const params = new URLSearchParams(location.search);

  // スマホの共有メニュー（PWA）から来たとき
  if (location.pathname === "/share") {
    const shared = [params.get("url"), params.get("text"), params.get("title")].filter(Boolean).join(" ");
    const last = local.get("lastRoom");
    location.replace(last ? `/r/${last}?add=${encodeURIComponent(shared)}` : "/");
    return;
  }
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{8,32})/);
  if (!m) {
    const last = local.get("lastRoom");
    if (location.pathname === "/" && last && lists.all().some((l) => l.id === last)) return location.replace(`/r/${last}`);
    if (!local.get("onboarded", false)) showOnboarding(() => { local.set("onboarded", true); createFlow(); });
    else createFlow();
    return;
  }
  let room, meta;
  try { [room, meta] = await Promise.all([api(`/rooms/${m[1]}`), api("/meta")]); }
  catch (e) {
    lists.forget(m[1]);
    document.body.innerHTML = `<div class="welcome">${LOGO}<h1>リストが見つかりません</h1><p>${esc(e.message)}</p><a class="btn rose" href="/new">新しいリストを作る</a></div>`;
    return;
  }
  lists.remember(room);
  document.title = `${room.name} | Spotrip`;
  const app = startApp(webBackend(room, meta));
  const add = params.get("add");
  if (params.has("add") || params.has("invite")) history.replaceState(null, "", `/r/${room.id}`);
  if (add) setTimeout(() => app.openAdd(add), 300);
  if (params.has("invite")) setTimeout(() => document.querySelector("[data-act=settings]") && app.invite(), 400);
}

boot();
