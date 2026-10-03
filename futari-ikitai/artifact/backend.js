// アーティファクト版の入り口：claude.ai の共有データベース（db）と Claude（sample）を使う backend を作り、画面は core.js に任せる
import { startApp, coordsFrom } from "../public/core.js";

const DB_ERRORS = {
  invalid_argument: "編集する権限がありません。リストの持ち主に「編集できる」で共有してもらってください",
  quota_exceeded: "保存できる量の上限です。いらないスポットを削除してください",
  resource_exhausted: "操作が多すぎます。少し待ってからもう一度試してください",
};
const SAMPLE_OFF = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];

async function artifactBackend() {
  const [db, user, sample] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("sample")]);
  const meId = user ? await user.id() : null;
  const limits = sample ? await sample.limits().catch(() => null) : null;
  let aiOn = Boolean(sample);
  let profiles = {};
  let spots = [];
  let settings = null;
  let listener = () => {};
  const emit = () => listener({ settings, spots });

  const wrap = (p) => p.catch((e) => { throw new Error(DB_ERRORS[e?.code] || "保存できませんでした。少し待ってからもう一度試してください"); });
  const idsInUse = (list = spots) => [...new Set([meId, ...list.flatMap((s) => [s.addedBy, ...Object.keys(s.likes || {}), ...(s.comments || []).map((c) => c.by)])].filter(Boolean))];
  const sampleError = (e) => {
    if (SAMPLE_OFF.includes(e?.code)) { aiOn = false; return "この表示ではAI読み取りを使えません"; }
    if (e?.code === "rate_limited") return "AIの利用が混み合っています。少し時間をおいて試してください";
    if (e?.code === "image_rejected") return "この画像は読み取れませんでした。別のスクリーンショットを選んでください";
    if (e?.code === "invalid_json" || e?.code === "empty_completion") return "うまく読み取れませんでした。本文を貼ってもう一度試してください";
    return "読み取りに失敗しました。もう一度試してください";
  };

  return {
    kind: "artifact",
    unavailable: db ? "" : "claude.ai にサインインして開くと、みんなで共有して使えます。",
    features: { map: false, thumbnails: false, aiButton: aiOn, aiImage: Boolean(limits?.images), ics: false, invite: false, members: false, lists: false, export: false, clipboardRead: false, geolocation: false },
    shareNote: "一緒に使う人も claude.ai にサインインしている必要があります。サインインなしで使うなら Webアプリ版を使ってください。",
    readerNote: aiOn ? "本文を読み取り、「AIで読み取る」でClaudeが整理します（押した人の利用枠を使います）" : "本文をルールで読み取っています",
    subscribe(fn) {
      listener = fn;
      if (!db) { settings = {}; emit(); return; }
      db.collection("spots").onSnapshot(async (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // 名前を引いてから差し替える（先に差し替えると「相手」と表示されてしまう）
        if (user) profiles = await user.profiles(idsInUse(next));
        spots = next;
        emit();
      }, () => emit());
      db.doc("meta/settings").onSnapshot((d) => { settings = d.exists ? d.data() : {}; emit(); }, () => {});
    },
    me: () => meId,
    setMe() {},
    needsPick: () => false,
    people: () => idsInUse().map((id) => ({ id, name: profiles[id]?.name || "", color: profiles[id]?.color || "#9a8a8f", avatar: profiles[id]?.avatarUrl || "" })),
    addSpot: (body) => wrap(db.collection("spots").add({ ...body, status: "want", likes: meId ? { [meId]: true } : {}, comments: [], addedBy: meId, createdAt: new Date().toISOString() })),
    updateSpot: (id, patch) => wrap(db.collection("spots").doc(id).update({ ...patch, updatedAt: new Date().toISOString() })),
    deleteSpot: (id) => wrap(db.collection("spots").doc(id).delete()),
    vote: (id, value) => wrap(db.collection("spots").doc(id).update({ likes: { [meId]: value } })),
    comment(id, text) {
      const it = spots.find((s) => s.id === id);
      return wrap(db.collection("spots").doc(id).update({ comments: [...(it?.comments || []), { by: meId, text, at: new Date().toISOString() }].slice(-100) }));
    },
    saveSettings: (patch) => wrap(db.doc("meta/settings").set({ name: "行きたいリスト", bases: [], ...(settings || {}), ...patch })),
    async readPost({ url = "", text = "", image = null, ai = false }) {
      const cleanUrl = url ? normalizeUrl(url) : "";
      const draft = { ...analyzeText(text), url: cleanUrl, platform: cleanUrl ? detectPlatform(cleanUrl) : "web", caption: text, ...(coordsFrom(url) || coordsFrom(text) || {}) };
      if (!ai) return draft;
      if (!aiOn) throw new Error("この表示ではAI読み取りを使えません");
      const genres = GENRES.map((g) => `"${g.id}"(${g.label})`).join("/");
      const prompt = `SNSで見つけたお出かけ先を整理しています。次の投稿から、行きたい場所の情報をJSONで返してください。\n` +
        `わからない項目は空文字かnullにし、投稿にない値段や営業時間は作らないでください。\n` +
        `lat/lng は、店名や住所・駅名から位置をおおよそ特定できるときだけ、あなたの知識で推定してください（わからなければnull）。\n` +
        `今日は ${new Date().toISOString().slice(0, 10)} です。` + (image ? "添付画像は投稿のスクリーンショットです。写っている文字も読んでください。" : "") + `\n` +
        `返すJSON: {"placeName":"店名・施設名","address":"住所","prefecture":"都道府県","city":"市区町村","station":"最寄り駅","genre":${genres},"priceMin":1人あたりの最低価格(円・数値かnull),"priceMax":数値かnull,"hours":"営業時間","closed":"定休日","deadline":"期間限定の終了日 YYYY-MM-DD か空文字","summary":"どんな場所かを40字以内で紹介","lat":数値かnull,"lng":数値かnull}\n\n` +
        `<post>\nURL: ${cleanUrl || "なし"}\n本文:\n${String(text).slice(0, 4000)}\n</post>`;
      try {
        const res = await sample.json(prompt, image ? { images: image } : {});
        if (!res || typeof res !== "object") throw { code: "invalid_json" };
        const out = { ...draft, aiUsed: true };
        for (const [k, v] of Object.entries(res)) if (v !== "" && v != null && (out[k] === "" || out[k] == null || out[k] === "other")) out[k] = v;
        if (res.lat != null && Number.isFinite(Number(res.lat))) { out.lat = Number(res.lat); out.lng = Number(res.lng); out.geoNote = "AIが推定した位置です"; }
        return out;
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
