import { test } from "node:test";
import assert from "node:assert/strict";
import { appLinks, parseHours, openState, seasonOf, buildCourses, externalLinks, calendarUrl, courseRouteUrl, requiredYes } from "../public/smart.js";

const at = (dateStr, hm) => new Date(`${dateStr}T${hm}:00`);
// 2026-10-06 は火曜日
const TUE = "2026-10-06";

test("営業時間の読み取り", () => {
  const p = parseHours("11:30〜22:00", "火曜日");
  assert.deepEqual(p.ranges, [[690, 1320]]);
  assert.deepEqual([...p.closedDays], [2]);
  assert.deepEqual([...parseHours("10時〜19時（水・木曜定休）").closedDays].sort(), [3, 4]);
  assert.deepEqual(parseHours("18:00-翌2:00").ranges, [[1080, 1560]]);
  assert.equal(parseHours("24時間営業").allDay, true);
  assert.equal(parseHours("土日祝", ""), null, "営業時間欄の曜日だけでは定休日にしない");
  assert.deepEqual([...parseHours("", "日曜日・祝日").closedDays], [0]);
  assert.equal(parseHours("", ""), null);
});

test("今開いているか", () => {
  const spot = { hours: "11:00〜20:00", closed: "火曜" };
  assert.equal(openState(spot, at(TUE, "12:00")).state, "closed");
  assert.equal(openState(spot, at("2026-10-07", "12:00")).state, "open");
  assert.equal(openState(spot, at("2026-10-07", "19:30")).state, "closing");
  assert.match(openState(spot, at("2026-10-07", "09:00")).label, /11:00から/);
  assert.equal(openState({ hours: "18:00-翌2:00" }, at("2026-10-07", "00:30")).state, "open");
  assert.equal(openState({ hours: "おいしい" }), null);
});

test("旬の判定", () => {
  assert.equal(seasonOf({ tags: ["紅葉"] }, new Date("2026-11-10")).now, true);
  assert.equal(seasonOf({ caption: "紅葉ライトアップ" }, new Date("2026-09-20")).now, false);
  assert.equal(seasonOf({ caption: "カフェ" }, new Date("2026-11-10")), null);
});

test("デートコースは近い場所をまとめ、時間帯の順に並べる", () => {
  const both = { a: true, b: true };
  const spots = [
    { id: "1", placeName: "表参道のカフェ", genre: "cafe", lat: 35.6672, lng: 139.7087, likes: both, priceMin: 1200 },
    { id: "2", placeName: "根津美術館", genre: "art", lat: 35.6623, lng: 139.7186, likes: both, priceMin: 1400 },
    { id: "3", placeName: "渋谷のビストロ", genre: "gourmet", lat: 35.6595, lng: 139.7005, likes: { a: true }, priceMin: 4000 },
    { id: "4", placeName: "箱根の旅館", genre: "stay", lat: 35.2324, lng: 139.1069, likes: both },
    { id: "5", placeName: "京都のお寺", genre: "sightseeing", lat: 35.0116, lng: 135.7681, likes: both },
    { id: "6", placeName: "行った店", genre: "bar", status: "visited", lat: 35.66, lng: 139.70, likes: both },
  ];
  const [best] = buildCourses(spots, { stops: 3, style: "afternoon" });
  const ids = best.stops.map((s) => s.spot.id);
  assert.deepEqual([...ids].sort(), ["1", "2", "3"]);
  assert.equal(ids[ids.length - 1], "3", "夕方からのコースはディナーで締める");
  assert.equal(best.budget, 6600);
  assert.ok(best.stops.slice(1).every((s) => s.leg && s.leg.min > 0));
  assert.ok(!buildCourses(spots, { stops: 3 }).some((c) => c.stops.some((s) => ["4", "6"].includes(s.spot.id))));
  assert.ok(buildCourses(spots, { bothOnly: true }).every((c) => c.stops.every((s) => s.spot.id !== "3")));
  assert.match(courseRouteUrl(best.stops), /waypoints=/);
});

test("外部リンク", () => {
  const s = { placeName: "焼肉たろう", city: "渋谷区", genre: "gourmet", url: "https://www.instagram.com/p/x/", platform: "instagram", lat: 35.6, lng: 139.7 };
  const links = externalLinks(s, { lat: 35.65, lng: 139.70 });
  const ids = links.map((l) => l.id);
  assert.deepEqual(ids.slice(0, 2), ["post", "route"]);
  assert.ok(ids.includes("tabelog"));
  assert.match(links.find((l) => l.id === "route").url, /origin=35\.65,139\.7&destination=35\.6%2C139\.7&travelmode=transit/);
  assert.match(calendarUrl(s, "2026-10-10", "18:30", 90), /dates=20261010T183000\/20261010T200000/);
});

test("マッチに必要な人数", () => {
  assert.equal(requiredYes(1), 1);
  assert.equal(requiredYes(2), 2);
  assert.equal(requiredYes(3), 2);
  assert.equal(requiredYes(5), 3);
  assert.equal(requiredYes(8), 4);
});

test("グループでは過半数が行きたい場所だけを選べる", () => {
  const spots = [
    { id: "a", genre: "cafe", lat: 35.66, lng: 139.70, likes: { m1: true, m2: true } },
    { id: "b", genre: "art", lat: 35.661, lng: 139.701, likes: { m1: true } },
    { id: "c", genre: "gourmet", lat: 35.662, lng: 139.702, likes: { m1: true, m2: true, m3: true } },
  ];
  const ids = buildCourses(spots, { stops: 3, bothOnly: true, peopleCount: 4 })[0].stops.map((s) => s.spot.id).sort();
  assert.deepEqual(ids, ["a", "c"]);
});

test("うろ覚え検索", async () => {
  const { fuzzySearch } = await import("../public/smart.js");
  const now = new Date("2026-10-03T12:00:00").getTime();
  const genres = [{ id: "cafe", label: "カフェ", words: ["カフェ"] }, { id: "sweets", label: "スイーツ", words: ["パフェ"] }];
  const spots = [
    { id: "1", placeName: "シーサイドカフェ", genre: "cafe", caption: "海を眺めながらラテ", priceMin: 800, addedBy: "m2", createdAt: "2026-09-01T00:00:00Z" },
    { id: "2", placeName: "パーラー苺", genre: "sweets", caption: "苺パフェ", priceMin: 1800, addedBy: "m1", createdAt: "2026-09-30T00:00:00Z" },
    { id: "3", placeName: "焼肉 大将", genre: "gourmet", caption: "", priceMin: 6000, addedBy: "m2", createdAt: "2026-09-29T00:00:00Z" },
  ];
  const ids = (q) => fuzzySearch(spots, q, { genres, members: { m1: "だいき", m2: "はるか" }, now }).results.map((r) => r.spot.id);
  assert.deepEqual(ids("海が見えるカフェ"), ["1"]);
  assert.deepEqual(ids("甘いやつ"), ["2"]);
  assert.deepEqual(ids("はるかが見つけた安いとこ"), ["1"]);
  assert.deepEqual(ids("最近のちょっといい店"), ["3"]);
  assert.deepEqual(ids("オーシャン"), ["1"]);
  assert.deepEqual(ids("存在しないもの"), []);
  assert.deepEqual(ids("夜ごはん"), [], "「夜」ではなく「夜ごはん（ディナー）」として読む");
});

test("メンバーの称号と相性", async () => {
  const { memberStats, compatibility, monthGrid, eventsOn } = await import("../public/smart.js");
  const spots = [
    { id: "1", genre: "sweets", addedBy: "a", likes: { a: true, b: true, c: "no" }, comments: [{ by: "c" }, { by: "c" }, { by: "c" }] },
    { id: "2", genre: "sweets", addedBy: "a", likes: { a: true, b: true, c: "no" } },
    { id: "3", genre: "gourmet", addedBy: "a", likes: { a: true, b: "no", c: true } },
    { id: "4", genre: "cafe", addedBy: "b", likes: { a: true, b: true } },
  ];
  assert.equal(compatibility(spots, "a", "b"), 75);
  assert.equal(compatibility(spots, "a", "c"), 33);
  const { members, best } = memberStats(spots, ["a", "b", "c"]);
  const t = Object.fromEntries(members.map((m) => [m.id, m.titles]));
  assert.ok(t.a.includes("発見王👑") && t.a.includes("甘党代表🍰"));
  assert.ok(t.c.includes("おしゃべり隊長💬") && t.c.includes("見る専門👀"));
  assert.deepEqual([best.a, best.b, best.score], ["a", "b", 75]);
  const g = monthGrid("2026-10");
  assert.equal(g.length % 7, 0);
  assert.equal(g.indexOf("2026-10-01"), 4, "2026年10月1日は木曜日");
  assert.equal(eventsOn([{ status: "planned", plannedDate: "2026-10-10" }, { deadline: "2026-10-10" }], "2026-10-10").deadline.length, 1);
});

test("移動手段ごとの目安", async () => {
  const { travelModes } = await import("../public/smart.js");
  const shibuya = { lat: 35.658, lng: 139.7016 };
  const near = travelModes(shibuya, { lat: 35.6654, lng: 139.7121 }, { toStation: "表参道駅", toName: "カフェ" });
  const ids = near.modes.map((m) => m.id);
  assert.ok(["walk", "bicycle", "train", "bus", "car", "taxi"].every((id) => ids.includes(id)));
  assert.ok(!ids.includes("shinkansen") && !ids.includes("plane"));
  const train = near.modes.find((m) => m.id === "train");
  assert.match(train.steps[1].text, /表参道駅/);
  assert.equal(train.min, train.steps.reduce((s, x) => s + x.min, 0), "合計は各ステップの和");
  const kyoto = travelModes(shibuya, { lat: 35.0116, lng: 135.7681 });
  const k = Object.fromEntries(kyoto.modes.map((m) => [m.id, m]));
  assert.ok(k.shinkansen && k.highwayBus && k.plane && k.car);
  assert.ok(!k.walk && !k.bus && !k.taxi);
  assert.ok(k.shinkansen.min > 120 && k.shinkansen.min < 260, `新幹線 ${k.shinkansen.min}分`);
  assert.ok(k.shinkansen.recommended, "京都へは新幹線がおすすめ");
  assert.ok(k.highwayBus.fare < k.shinkansen.fare);
  const fukuoka = travelModes(shibuya, { lat: 33.5902, lng: 130.4017 });
  assert.ok(fukuoka.modes.find((m) => m.id === "plane").recommended, "福岡へは飛行機がおすすめ");
});

test("デートコースの予算は交通費込み", async () => {
  const { buildCourses, legInfo } = await import("../public/smart.js");
  const both = { a: true, b: true };
  const spots = [
    { id: "1", genre: "cafe", lat: 35.6672, lng: 139.7087, likes: both, priceMin: 1200 },
    { id: "2", genre: "art", lat: 35.6623, lng: 139.7186, likes: both, priceMin: 1400 },
  ];
  const far = { lat: 35.4437, lng: 139.638 }; // 横浜から出発
  const [c] = buildCourses(spots, { stops: 2, base: far });
  assert.equal(c.budget, 2600);
  assert.ok(c.access.go.mode === "電車" && c.access.go.fare > 300, "横浜からは電車代がかかる");
  assert.equal(c.total, c.budget + c.transport);
  assert.ok(c.transport >= c.access.go.fare + c.access.back.fare);
  assert.equal(buildCourses(spots, { stops: 2, base: far, budget: 2700 }).length, 0, "スポット代だけなら収まっても交通費で超える");
  assert.equal(buildCourses(spots, { stops: 2, base: far, budget: c.total }).length, 1);
  assert.equal(legInfo({ lat: 35.66, lng: 139.70 }, { lat: 35.661, lng: 139.701 }).fare, 0, "徒歩は0円");
});

test("ほかのアプリのリンクはアプリごとにまとまる", () => {
  const s = { id: "a", placeName: "焼肉たろう", city: "渋谷区", genre: "gourmet", url: "https://www.instagram.com/p/x/", platform: "instagram", lat: 35.6, lng: 139.7 };
  const g = appLinks(s, { lat: 35.65, lng: 139.70 }, { fromName: "渋谷駅" });
  assert.deepEqual(g.map((x) => x.section), ["地図・行き方", "SNS・口コミ", "予定・共有"]);
  const apps = g.flatMap((x) => x.apps.map((a) => a.app));
  assert.ok(["gmaps", "apple", "transit", "instagram", "tiktok", "x", "tabelog", "google", "calendar", "line"].every((a) => apps.includes(a)));
  // 元の投稿は Instagram の行に入り、Instagram は1行だけ
  const insta = g[1].apps.filter((a) => a.app === "instagram");
  assert.equal(insta.length, 1);
  assert.equal(insta[0].actions[0].label, "元の投稿");
  assert.match(g[0].apps[1].actions[1].url, /saddr=35\.65,139\.7&daddr=35\.6%2C139\.7&dirflg=r/);
});

test("コース：日付の範囲・予算の下限・自由な出発時刻・多い数", async () => {
  const { buildCourses, buildCoursesRange } = await import("../public/smart.js");
  const yes = { a: true, b: true };
  const mk = (id, genre, dlat, extra = {}) => ({ id, genre, placeName: id, lat: 35.66 + dlat, lng: 139.70 + dlat, priceMin: 1000, likes: yes, ...extra });
  // 月曜定休のカフェ：月曜〜火曜の範囲なら火曜を選ぶ
  const spots = [mk("cafe", "cafe", 0, { hours: "10:00〜19:00", closed: "月曜" }), mk("art", "art", 0.002, { hours: "10:00〜18:00" })];
  const r = buildCoursesRange(spots, { dateFrom: "2026-10-05", dateTo: "2026-10-06", stops: 2 });
  assert.equal(r[0].date, "2026-10-06");
  assert.equal(r[0].warnings.length, 0);
  // 予算の下限
  assert.equal(buildCourses(spots, { stops: 2, budgetMin: 5000 }).length, 0);
  assert.equal(buildCourses(spots, { stops: 2, budgetMin: 1500, budget: 2500 }).length, 1);
  // 自由な出発時刻
  assert.equal(buildCourses(spots, { stops: 2, start: 10 * 60 + 30, date: "2026-10-06" })[0].start, "10:30");
  // 8か所（同じジャンルは2つまで、2軒目のごはんは夕食）
  const genres = ["cafe", "gourmet", "gourmet", "art", "nature", "shopping", "sweets", "sightseeing", "bar"];
  const many = genres.map((g, i) => mk(`s${i}`, g, i * 0.003));
  const [c] = buildCourses(many, { stops: 8, start: 9 * 60 });
  assert.equal(c.stops.length, 8);
  const meals = c.stops.filter((x) => x.spot.genre === "gourmet").map((x) => x.arrive);
  if (meals.length === 2) assert.ok(meals[1] >= "17:00", meals.join(","));
});

test("コース：気分とエリア", async () => {
  const { buildCourses, inArea } = await import("../public/smart.js");
  const yes = { a: true, b: true };
  const at = (id, genre, lat, lng, extra = {}) => ({ id, genre, placeName: id, lat, lng, priceMin: 1000, likes: yes, ...extra });
  const spots = [
    at("渋谷カフェ", "cafe", 35.6640, 139.7020), at("渋谷公園", "nature", 35.6660, 139.6960), at("渋谷美術館", "art", 35.6650, 139.7050), at("渋谷モール", "shopping", 35.6600, 139.7010),
    at("名古屋カフェ", "cafe", 35.1700, 136.8800), at("名古屋城", "sightseeing", 35.1856, 136.8990), at("名古屋めし", "gourmet", 35.1680, 136.8850),
  ];
  assert.ok(inArea(spots[4], { id: "nagoya" }) && !inArea(spots[0], { id: "nagoya" }));
  const nagoya = buildCourses(spots, { stops: 3, area: { id: "nagoya" } });
  assert.ok(nagoya.length && nagoya.every((c) => c.stops.every((x) => x.spot.id.startsWith("名古屋"))));
  // 雨の日：公園は入らない
  const rainy = buildCourses(spots, { stops: 3, area: { id: "shibuya" }, moods: ["rainy"] });
  assert.ok(rainy.length && rainy.every((c) => c.stops.every((x) => x.spot.genre !== "nature")));
  // のんびり：公園が入る
  const relax = buildCourses(spots, { stops: 2, area: { id: "shibuya" }, moods: ["relax"] });
  assert.ok(relax[0].stops.some((x) => x.spot.genre === "nature"));
  assert.deepEqual(buildCourses(spots, { stops: 2, area: { prefecture: "大阪府" } }), []);
});
