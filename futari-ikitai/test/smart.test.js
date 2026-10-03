import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHours, openState, seasonOf, buildCourses, externalLinks, calendarUrl, courseRouteUrl } from "../public/smart.js";

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
