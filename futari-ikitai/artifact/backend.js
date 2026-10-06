// アーティファクト版の入り口：claude.ai の共有データベース（db）と Claude（sample）を使う backend を作り、画面は core.js に任せる
import { startApp, coordsFrom } from "../public/core.js";

const DB_ERRORS = {
  invalid_argument: "書き込む権限がありません。リーダーに、共有メニューからメールで「編集者」として招待してもらってください",
  quota_exceeded: "保存できる量の上限です。いらないスポットを削除してください",
  resource_exhausted: "操作が多すぎます。少し待ってからもう一度試してください",
};
const SAMPLE_OFF = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function artifactBackend() {
  const [db, user, sample] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("sample")]);
  const meId = user ? await user.id() : null;
  const limits = sample ? await sample.limits().catch(() => null) : null;
  let aiOn = Boolean(sample);
  let profiles = {};
  let spots = [];
  let settings = null;
  let listener = () => {};
  let reset = false;
  const emit = () => { listener({ settings, spots, reset }); reset = false; };

  // ---------- 部屋 ----------
  // 部屋の名前・ジャンル・共有コード・リーダーは rooms/<id>（リーダー＝アーティファクトの持ち主だけが書ける）。
  // 出発地・メンバー・ニックネームなど、みんなで変える設定は部屋ごとの設定（main は meta/settings、ほかは groups/<id>）。
  // 自分が入っている部屋の一覧は、自分だけが読める data/users/<自分>/profile に保存する。
  const owner = user ? await user.isOwner().catch(() => false) : false;
  const canWrite = user ? await user.can("data.write").catch(() => null) : null;
  // リーダーがゲストの画面を確かめるためのプレビュー（このタブの間だけ）
  const PREVIEW_KEY = "spotrip.previewGuest";
  let preview = false;
  try { preview = owner && sessionStorage.getItem(PREVIEW_KEY) === "1"; } catch {}
  const leader = owner && !preview;
  let gid = leader ? "main" : "";
  let myGroups = leader ? ["main"] : [];
  const groupNames = {};
  const ROOM_KEYS = ["name", "type", "code"];
  const roomRef = (g = gid) => db.doc(`rooms/${g}`);
  const settingsRef = (g = gid) => (g === "main" ? db.doc("meta/settings") : db.doc(`groups/${g}`));
  const spotsCol = (g = gid) => (g === "main" ? db.collection("spots") : db.collection(`groups/${g}/spots`));
  const myDoc = () => (db && meId ? db.doc(`data/users/${meId}/${preview ? "preview" : "profile"}`) : null);
  const saveMine = () => myDoc()?.set({ groups: myGroups, current: gid }).catch(() => {});
  if (myDoc()) {
    const d = await myDoc().get().catch(() => null);
    if (d?.exists && Array.isArray(d.data().groups) && d.data().groups.length) {
      myGroups = d.data().groups;
      gid = myGroups.includes(d.data().current) ? d.data().current : myGroups[0];
      if (!leader) myGroups = [gid];
    }
  }
  // 部屋の情報（rooms の内容を優先し、古いデータは部屋の設定から補う）
  const merge = (set = {}, room = {}) => { const out = { ...set }; for (const k of [...ROOM_KEYS, "leader"]) if (room[k]) out[k] = room[k]; return out; };
  async function roomInfo(g) {
    const [r, st] = await Promise.all([roomRef(g).get().catch(() => null), settingsRef(g).get().catch(() => null)]);
    return { room: r?.exists ? r.data() : null, set: st?.exists ? st.data() : null };
  }
  // 部屋一覧に出す名前・種類・メンバー（ほかの部屋のメンバーも一覧で見られるように）
  const allProfiles = {};
  const noteGroup = (g, data = {}) => { groupNames[g] = { name: data.name || "行きたいリスト", type: data.type, leader: data.leader || "", members: Array.isArray(data.members) ? data.members : [], nicknames: data.nicknames || {}, avatars: data.avatars || {} }; };
  const loadProfiles = async (ids) => {
    const need = ids.filter((id) => id && !allProfiles[id]);
    if (!user || !need.length) return;
    Object.assign(allProfiles, await user.profiles(need).catch(() => ({})));
  };
  if (db) for (const g of myGroups) {
    const { room, set } = await roomInfo(g);
    noteGroup(g, merge(set || {}, room || {}));
  }
  await loadProfiles(myGroups.flatMap((g) => [groupNames[g].leader, ...groupNames[g].members]));

  let unsubs = [];
  let roomMeta = {};
  let settingsDoc = {};
  let subscribed = false;
  const refreshSettings = () => { settings = merge(settingsDoc, roomMeta); noteGroup(gid, settings); };
  function open(g) {
    unsubs.forEach((u) => u());
    unsubs = [];
    gid = g;
    spots = [];
    settings = null;
    roomMeta = {};
    settingsDoc = {};
    reset = true;
    if (!db || !g) { settings = {}; emit(); return; }
    let gotSettings = false, gotSpots = false, gotRoom = false;
    const ready = () => gotSettings && gotSpots && gotRoom;
    unsubs.push(spotsCol().onSnapshot(async (snap) => {
      const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // 名前を引いてから差し替える（先に差し替えると「相手」と表示されてしまう）
      if (user) { profiles = await user.profiles(idsInUse(next, true)); Object.assign(allProfiles, profiles); }
      if (g !== gid) return;
      spots = next;
      gotSpots = true;
      if (ready()) emit();
    }, () => { gotSpots = true; if (ready()) emit(); }));
    unsubs.push(roomRef(g).onSnapshot(async (d) => {
      if (g !== gid) return;
      roomMeta = d.exists ? d.data() : {};
      // リーダーが開いたとき、古い形の部屋（rooms がない）を新しい形にそろえる
      if (!d.exists && owner && gotSettings) migrate(g);
      if (roomMeta.leader && user && !profiles[roomMeta.leader]) { Object.assign(profiles, await user.profiles([roomMeta.leader]).catch(() => ({}))); }
      gotRoom = true;
      refreshSettings();
      if (ready()) emit();
    }, () => { gotRoom = true; if (ready()) emit(); }));
    unsubs.push(settingsRef(g).onSnapshot((d) => {
      if (g !== gid) return;
      settingsDoc = d.exists ? d.data() : {};
      // 開いた人をメンバーとして記録する（部屋のメンバー一覧に出すため）
      const mem = Array.isArray(settingsDoc.members) ? settingsDoc.members : [];
      if (meId && canWrite !== false && !mem.includes(meId)) settingsRef(g).set({ ...settingsDoc, members: [...mem, meId] }).catch(() => {});
      const first = !gotSettings;
      gotSettings = true;
      if (first && gotRoom && !roomMeta.leader && owner) migrate(g);
      refreshSettings();
      if (ready()) emit();
    }, () => { gotSettings = true; if (ready()) emit(); }));
  }
  let migrating = false;
  async function migrate(g) {
    if (migrating || !owner) return;
    migrating = true;
    const meta = { name: settingsDoc.name || "行きたいリスト", type: settingsDoc.type || "", code: settingsDoc.code || newCode(), leader: meId, createdAt: new Date().toISOString() };
    await roomRef(g).set({ ...meta, ...Object.fromEntries(Object.entries(roomMeta).filter(([, v]) => v)) }).catch(() => {});
    migrating = false;
  }
  async function switchTo(g) {
    if (!myGroups.includes(g)) myGroups = [...myGroups, g];
    gid = g;
    await saveMine();
    if (subscribed) open(g);
  }
  // コードから部屋を探す（rooms → 古い形の部屋）
  async function findByCode(code) {
    const c = normCode(code);
    if (c.length < 4) throw new Error("6文字の招待コードを入れてください");
    if (!db) throw new Error("claude.ai にサインインして開いてください");
    let g = null;
    const q = await db.collection("rooms").where("code", "==", c).limit(1).get().catch(() => null);
    if (q && !q.empty) g = q.docs[0].id;
    if (!g) { const m = await db.doc("meta/settings").get().catch(() => null); if (m?.exists && m.data().code === c) g = "main"; }
    if (!g) { const q2 = await db.collection("groups").where("code", "==", c).limit(1).get().catch(() => null); if (q2 && !q2.empty) g = q2.docs[0].id; }
    if (!g) throw new Error("その招待コードの部屋は見つかりませんでした。コードを確かめてください");
    return g;
  }

  const wrap = (p) => p.catch((e) => { throw new Error(DB_ERRORS[e?.code] || "保存できませんでした。少し待ってからもう一度試してください"); });
  const members = () => (Array.isArray(settings?.members) ? settings.members : Array.isArray(settingsDoc?.members) ? settingsDoc.members : []);
  const idsInUse = (list = spots, withLeader = false) => [...new Set([meId, settings?.leader || roomMeta.leader, ...members(), ...list.flatMap((s) => [s.addedBy, ...Object.keys(s.likes || {}), ...(s.comments || []).map((c) => c.by)])].filter(Boolean))];
  const sampleError = (e) => {
    if (SAMPLE_OFF.includes(e?.code)) { aiOn = false; return "この表示ではAI読み取りを使えません"; }
    if (e?.code === "rate_limited") return "AIの利用が混み合っています。少し時間をおいて試してください";
    if (e?.code === "image_rejected") return "この画像は読み取れませんでした。別のスクリーンショットを選んでください";
    if (e?.code === "invalid_json" || e?.code === "empty_completion") return "うまく読み取れませんでした。本文を貼ってもう一度試してください";
    return "読み取りに失敗しました。もう一度試してください";
  };
  // 部屋の名前・ジャンル・コードはリーダーだけ。ほかの設定（出発地など）はみんなで変えられる
  async function saveSettings(patch) {
    const roomPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => ROOM_KEYS.includes(k)));
    const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !ROOM_KEYS.includes(k)));
    if (Object.keys(roomPatch).length) {
      if (!leader) throw new Error("部屋の名前やジャンルは、リーダーだけが変えられます");
      await wrap(roomRef().set({ name: "行きたいリスト", ...roomMeta, leader: roomMeta.leader || meId, ...roomPatch }));
    }
    if (Object.keys(rest).length) await wrap(settingsRef().set({ bases: [], ...settingsDoc, ...rest }));
  }

  return {
    kind: "artifact",
    unavailable: db ? "" : "claude.ai にサインインして開くと、みんなで共有して使えます。",
    features: { map: false, thumbnails: false, aiButton: aiOn, aiRead: aiOn, askAI: aiOn, routeAI: aiOn, aiImage: Boolean(limits?.images), ics: false, invite: false, codes: Boolean(db), members: false, memberList: true, lists: Boolean(db && meId && leader), leader, owner, preview, export: false, clipboardRead: false, geolocation: false },
    shareNote: "一緒に使う人も claude.ai にサインインしている必要があります。サインインなしで使うなら Webアプリ版を使ってください。",
    readerNote: aiOn ? "書いたメモや投稿をClaudeが分析します（使う人のClaudeの利用枠を使います）" : "書いたメモをルールで読み取っています",
    subscribe(fn) {
      listener = fn;
      subscribed = true;
      open(gid);
    },
    // ゲストがまだどの部屋にも入っていない（招待コードの入力から始める）
    needsJoin: () => Boolean(db) && !myGroups.length,
    // 書き込みの権限がない（閲覧のみで共有された）
    readOnly: canWrite === false,
    // リーダーがゲストの画面を確かめる
    setPreview(on) {
      try { on ? sessionStorage.setItem(PREVIEW_KEY, "1") : sessionStorage.removeItem(PREVIEW_KEY); } catch {}
      location.reload();
    },
    me: () => meId,
    setMe() {},
    needsPick: () => false,
    // ニックネームとアイコンはグループの設定に保存し、claude.ai の名前・写真より優先する
    people: () => idsInUse().map((id) => ({ id, name: settings?.nicknames?.[id] || profiles[id]?.name || "", color: profiles[id]?.color || "#9a8a8f", avatar: settings?.avatars?.[id] || profiles[id]?.avatarUrl || "", leader: id === settings?.leader })),
    leaderId: () => settings?.leader || "",
    renameMember: (id, name) => saveSettings({ nicknames: { ...(settings?.nicknames || {}), [id]: name } }),
    setAvatar: (id, avatar) => saveSettings({ avatars: { ...(settings?.avatars || {}), [id]: avatar } }),
    addSpot: (body) => wrap(spotsCol().add({ ...body, status: "want", likes: meId ? { [meId]: true } : {}, comments: [], addedBy: meId, createdAt: new Date().toISOString() })),
    updateSpot: (id, patch) => wrap(spotsCol().doc(id).update({ ...patch, updatedAt: new Date().toISOString() })),
    deleteSpot: (id) => wrap(spotsCol().doc(id).delete()),
    // 「まあまあ」には理由（任意）を添える。答え直したら「もう一度聞く」は終わり
    vote(id, value, reason = null) {
      const it = spots.find((s) => s.id === id);
      const patch = { likes: { [meId]: value }, reasons: { [meId]: value === "no" ? reason || null : null } };
      if ((value === true || value === "no") && it?.reaskAt) Object.assign(patch, { reaskAt: "", reaskBy: "" });
      return wrap(spotsCol().doc(id).update(patch));
    },
    comment(id, text) {
      const it = spots.find((s) => s.id === id);
      return wrap(spotsCol().doc(id).update({ comments: [...(it?.comments || []), { by: meId, text, at: new Date().toISOString() }].slice(-100) }));
    },
    saveSettings,
    // ---------- グループの切り替え・作成・共有コード ----------
    lists: () => myGroups.map((g) => {
      const n = groupNames[g] || {};
      const ids = g === gid ? idsInUse() : n.members || [];
      return { id: g, name: n.name || "行きたいリスト", type: n.type || "couple", current: g === gid, leader: n.leader,
        members: ids.map((id) => ({ id, name: n.nicknames?.[id] || allProfiles[id]?.name || "メンバー", color: allProfiles[id]?.color || "#9a8a8f", avatar: n.avatars?.[id] || allProfiles[id]?.avatarUrl || "" })) };
    }),
    openList: (g) => switchTo(g),
    // 部屋を作れるのはリーダーだけ
    async createList({ type, name }) {
      if (!leader) throw new Error("部屋を作れるのはリーダーだけです");
      const g = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await wrap(roomRef(g).set({ name, type, code: newCode(), leader: meId, createdAt: new Date().toISOString() }));
      await wrap(settingsRef(g).set({ bases: [], members: meId ? [meId] : [], createdAt: new Date().toISOString() }));
      noteGroup(g, { name, type, leader: meId, members: meId ? [meId] : [] });
      await switchTo(g);
    },
    // 招待コードから部屋を探して、参加する前に確かめてもらうための情報を返す
    async peekCode(code) {
      const g = await findByCode(code);
      const { room, set } = await roomInfo(g);
      const info = merge(set || {}, room || {});
      const ids = [...new Set([info.leader, ...(info.members || [])].filter(Boolean))];
      await loadProfiles(ids);
      const who = (id) => ({ id, name: info.nicknames?.[id] || allProfiles[id]?.name || "メンバー", color: allProfiles[id]?.color || "#9a8a8f", avatar: info.avatars?.[id] || allProfiles[id]?.avatarUrl || "", leader: id === info.leader });
      return { id: g, name: info.name || "行きたいリスト", type: info.type || "friends", leader: info.leader ? who(info.leader) : null, members: ids.map(who), joined: myGroups.includes(g) };
    },
    async joinRoom(g) {
      // ゲストが入れる部屋は1つだけ
      if (!leader && myGroups.length && !myGroups.includes(g)) throw new Error("ゲストが入れる部屋は1つだけです");
      noteGroup(g, groupNames[g] || {});
      const d = await settingsRef(g).get().catch(() => null);
      const mem = d?.exists && Array.isArray(d.data().members) ? d.data().members : [];
      if (meId && !mem.includes(meId)) await wrap(settingsRef(g).set({ bases: [], ...(d?.exists ? d.data() : {}), members: [...mem, meId] }));
      if (!leader) myGroups = [];
      await switchTo(g);
      return groupNames[g];
    },
    async joinByCode(code) {
      const info = await this.peekCode(code);
      await this.joinRoom(info.id);
      return info;
    },
    // 招待コードはリーダーだけが見られる（古い部屋にはまだないので、そのとき作る）
    async shareCode() {
      if (!leader) throw new Error("招待できるのはリーダーだけです");
      if (settings?.code) return settings.code;
      const code = newCode();
      await saveSettings({ code });
      return code;
    },
    async leave() {
      if (!leader) throw new Error("ゲストは部屋を抜けられません。リーダーに相談してください");
      if (myGroups.length <= 1) throw new Error("最後の部屋は抜けられません");
      myGroups = myGroups.filter((g) => g !== gid);
      gid = myGroups[0] || "";
      await saveMine();
      if (!gid) return location.reload();
      open(gid);
    },
    async readPost({ url = "", text = "", image = null, ai = false }) {
      const cleanUrl = url ? normalizeUrl(url) : "";
      const draft = { ...analyzeText(text), ...(cleanUrl ? {} : parseFreeform(text)), url: cleanUrl, platform: cleanUrl ? detectPlatform(cleanUrl) : "web", caption: text, ...(coordsFrom(url) || coordsFrom(text) || {}) };
      if (!ai) return draft;
      if (!aiOn) throw new Error("この表示ではAI読み取りを使えません");
      const memo = !cleanUrl && !image;
      const prompt = `${memo ? "メモ" : "SNSの投稿"}から、行きたいお出かけ先の情報を抜き出してください。今日は ${new Date().toISOString().slice(0, 10)} です。\n` + (memo ? `\n${MEMO_RULES}\n` : "") +
        (image ? "添付画像は投稿のスクリーンショットです。写っている文字（店名・住所・価格・営業時間）も読んでください。\n" : "") +
        `\n${EXTRACT_RULES}\n- lat / lng: 店名・住所・駅名から位置がおおよそ特定できるときだけ、あなたの知識で緯度経度を推定（わからなければ null）。\n\n<genres>\n${GENRE_GUIDE}\n</genres>\n\n` +
        `返すJSON: {"placeName":"","address":"","prefecture":"","city":"","station":"","walkMin":null,"genre":"other","priceMin":null,"priceMax":null,"hours":"","closed":"","deadline":"","summary":"","lat":null,"lng":null}\n\n` +
        `<post>\nURL: ${cleanUrl || "なし"}\n本文:\n${String(text).slice(0, 4000)}\n</post>` + hintsText(draft);
      try {
        const res = cleanAiResult(await sample.json(prompt, image ? { images: image } : {}));
        if (!res) throw { code: "invalid_json" };
        const out = { ...draft, aiUsed: true };
        // AIの答えを優先（ルールで読んだ候補を直してもらうため）。AIが空のところだけルールの値を残す
        for (const [k, v] of Object.entries(res)) if (v !== "" && v != null && !(k === "genre" && v === "other")) out[k] = v;
        if (res.lat != null) { out.lat = res.lat; out.lng = res.lng; out.geoNote = "AIが推定した位置です"; }
        return out;
      } catch (e) {
        throw new Error(sampleError(e));
      }
    },
    async ask(question, items) {
      if (!aiOn) throw new Error("この表示ではAIを使えません");
      const prompt = `行きたい場所を貯めたリストがあります。うろ覚えの質問に当てはまりそうな場所を、当てはまる順に最大5つ選んでください。\n` +
        `当てはまるものがなければ空の配列にしてください。reason は「なぜそれっぽいか」を20字ほどで。\n` +
        `返すJSON: {"picks":[{"id":"リストのid","reason":"理由"}]}\n\n質問: ${question}\n\nリスト:\n${JSON.stringify(items).slice(0, 60000)}`;
      try {
        const r = await sample.json(prompt);
        return Array.isArray(r?.picks) ? r.picks : [];
      } catch (e) {
        throw new Error(sampleError(e));
      }
    },
    async route({ from, to, mode }) {
      if (!aiOn) throw new Error("この表示ではAIを使えません");
      const prompt = `${ROUTE_RULES}\n\n返すJSON: {"steps":[{"type":"walk","text":"","minutes":5}],"totalMinutes":null,"fareYen":null,"note":""}\n\n<from>${JSON.stringify(from)}</from>\n<to>${JSON.stringify(to)}</to>\n<mode>${mode}</mode>`;
      try {
        const r = await sample.json(prompt);
        return r && Array.isArray(r.steps) ? r : { steps: [], note: "うまく調べられませんでした" };
      } catch (e) {
        throw new Error(sampleError(e));
      }
    },
    async locate(q) {
      const c = coordsFrom(q);
      if (c) return c;
      if (!aiOn) throw new Error("GoogleマップでそのURLを開き、URLを貼ってください");
      try {
        const r = await sample.json(`日本の次の場所の緯度経度を、あなたの知識で推定してください。駅なら駅、住所なら住所の中心付近。特定できなければ lat と lng を null にしてください。\n返すJSON: {"lat": 数値, "lng": 数値}\n場所: ${q}`, { modelTier: "quick" });
        return r && r.lat != null && Number.isFinite(Number(r.lat)) ? { lat: Number(r.lat), lng: Number(r.lng), estimated: true } : null;
      } catch (e) {
        throw new Error(sampleError(e));
      }
    },
  };
}

artifactBackend().then((backend) => {
  document.getElementById("boot")?.remove();
  startApp(backend);
});
