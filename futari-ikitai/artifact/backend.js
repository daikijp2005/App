// アーティファクト版の入り口：claude.ai の共有データベース（db）と Claude（sample）を使う backend を作り、画面は core.js に任せる
import { startApp, coordsFrom } from "../public/core.js";

const DB_ERRORS = {
  invalid_argument: "編集する権限がありません。リストの持ち主に「編集できる」で共有してもらってください",
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

  // ---------- グループ ----------
  // 最初からあるグループは "main"（meta/settings と spots）。追加したグループは groups/<id> と groups/<id>/spots。
  // 自分が参加しているグループの一覧は、自分だけが読める data/users/<自分>/profile に保存する。
  let gid = "main";
  let myGroups = ["main"];
  const groupNames = {};
  const settingsRef = (g = gid) => (g === "main" ? db.doc("meta/settings") : db.doc(`groups/${g}`));
  const spotsCol = (g = gid) => (g === "main" ? db.collection("spots") : db.collection(`groups/${g}/spots`));
  const myDoc = () => (db && meId ? db.doc(`data/users/${meId}/profile`) : null);
  const saveMine = () => myDoc()?.set({ groups: myGroups, current: gid }).catch(() => {});
  if (myDoc()) {
    const d = await myDoc().get().catch(() => null);
    if (d?.exists && Array.isArray(d.data().groups) && d.data().groups.length) {
      myGroups = d.data().groups;
      gid = myGroups.includes(d.data().current) ? d.data().current : myGroups[0];
    }
  }
  for (const g of myGroups) {
    const d = await settingsRef(g).get().catch(() => null);
    groupNames[g] = d?.exists ? { name: d.data().name, type: d.data().type } : { name: "行きたいリスト" };
  }

  let unsubs = [];
  function open(g) {
    unsubs.forEach((u) => u());
    unsubs = [];
    gid = g;
    spots = [];
    settings = null;
    reset = true;
    if (!db) { settings = {}; emit(); return; }
    let gotSettings = false, gotSpots = false;
    unsubs.push(spotsCol().onSnapshot(async (snap) => {
      const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // 名前を引いてから差し替える（先に差し替えると「相手」と表示されてしまう）
      if (user) profiles = await user.profiles(idsInUse(next));
      if (g !== gid) return;
      spots = next;
      gotSpots = true;
      if (gotSettings) emit();
    }, () => { gotSpots = true; if (gotSettings) emit(); }));
    unsubs.push(settingsRef().onSnapshot((d) => {
      if (g !== gid) return;
      settings = d.exists ? d.data() : {};
      groupNames[g] = { name: settings.name || "行きたいリスト", type: settings.type };
      gotSettings = true;
      if (gotSpots) emit();
    }, () => {}));
  }
  async function switchTo(g) {
    if (!myGroups.includes(g)) myGroups = [...myGroups, g];
    await saveMine();
    open(g);
  }

  const wrap = (p) => p.catch((e) => { throw new Error(DB_ERRORS[e?.code] || "保存できませんでした。少し待ってからもう一度試してください"); });
  const members = () => (Array.isArray(settings?.members) ? settings.members : []);
  const idsInUse = (list = spots) => [...new Set([meId, ...members(), ...list.flatMap((s) => [s.addedBy, ...Object.keys(s.likes || {}), ...(s.comments || []).map((c) => c.by)])].filter(Boolean))];
  const sampleError = (e) => {
    if (SAMPLE_OFF.includes(e?.code)) { aiOn = false; return "この表示ではAI読み取りを使えません"; }
    if (e?.code === "rate_limited") return "AIの利用が混み合っています。少し時間をおいて試してください";
    if (e?.code === "image_rejected") return "この画像は読み取れませんでした。別のスクリーンショットを選んでください";
    if (e?.code === "invalid_json" || e?.code === "empty_completion") return "うまく読み取れませんでした。本文を貼ってもう一度試してください";
    return "読み取りに失敗しました。もう一度試してください";
  };
  const saveSettings = (patch) => wrap(settingsRef().set({ name: "行きたいリスト", bases: [], ...(settings || {}), ...patch }));

  return {
    kind: "artifact",
    unavailable: db ? "" : "claude.ai にサインインして開くと、みんなで共有して使えます。",
    features: { map: false, thumbnails: false, aiButton: aiOn, aiRead: aiOn, askAI: aiOn, routeAI: aiOn, aiImage: Boolean(limits?.images), ics: false, invite: false, codes: Boolean(db), members: false, lists: Boolean(db && meId), export: false, clipboardRead: false, geolocation: false },
    shareNote: "一緒に使う人も claude.ai にサインインしている必要があります。サインインなしで使うなら Webアプリ版を使ってください。",
    readerNote: aiOn ? "書いたメモや投稿をClaudeが分析します（使う人のClaudeの利用枠を使います）" : "書いたメモをルールで読み取っています",
    subscribe(fn) {
      listener = fn;
      open(gid);
    },
    me: () => meId,
    setMe() {},
    needsPick: () => false,
    // ニックネームとアイコンはグループの設定に保存し、claude.ai の名前・写真より優先する
    people: () => idsInUse().map((id) => ({ id, name: settings?.nicknames?.[id] || profiles[id]?.name || "", color: profiles[id]?.color || "#9a8a8f", avatar: settings?.avatars?.[id] || profiles[id]?.avatarUrl || "" })),
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
    lists: () => myGroups.map((g) => ({ id: g, name: groupNames[g]?.name || "行きたいリスト", type: groupNames[g]?.type || "couple", current: g === gid })),
    openList: (g) => switchTo(g),
    async createList({ type, name }) {
      const g = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await wrap(db.doc(`groups/${g}`).set({ name, type, code: newCode(), bases: [], members: meId ? [meId] : [], createdAt: new Date().toISOString() }));
      groupNames[g] = { name, type };
      await switchTo(g);
    },
    async joinByCode(code) {
      const c = normCode(code);
      if (c.length < 4) throw new Error("共有コードを入れてください");
      const main = await db.doc("meta/settings").get().catch(() => null);
      let g = main?.exists && main.data().code === c ? "main" : null;
      if (!g) {
        const q = await db.collection("groups").where("code", "==", c).limit(1).get().catch(() => null);
        if (q && !q.empty) g = q.docs[0].id;
      }
      if (!g) throw new Error("その共有コードのグループは見つかりませんでした。コードを確かめてください");
      const d = await settingsRef(g).get();
      groupNames[g] = { name: d.data()?.name || "行きたいリスト", type: d.data()?.type };
      if (g !== "main" && meId && !(d.data()?.members || []).includes(meId)) await settingsRef(g).update({ members: [...(d.data()?.members || []), meId] }).catch(() => {});
      await switchTo(g);
      return groupNames[g];
    },
    // 共有コードは必要になったときに作る（古いグループにはまだないため）
    async shareCode() {
      if (settings?.code) return settings.code;
      const code = newCode();
      await saveSettings({ code });
      return code;
    },
    async leave() {
      if (myGroups.length <= 1) throw new Error("最後のグループは抜けられません");
      myGroups = myGroups.filter((g) => g !== gid);
      await switchTo(myGroups[0]);
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
