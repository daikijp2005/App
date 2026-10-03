import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeText, extractPrice, classifyGenre } from "../lib/analyze.js";
import { parseHtml, normalizeUrl, detectPlatform, cleanCaption } from "../lib/preview.js";
import { estimateTravel, formatPrice, formatMinutes } from "../public/util.js";

const caption = `表参道にできた新しいカフェ☕️
ふわふわのパンケーキが絶品でした🥞

📍Cafe Lumière 表参道
住所：東京都渋谷区神宮前4-12-10
表参道駅から徒歩5分
営業時間 10:00〜19:00
定休日 火曜日
パンケーキ ¥1,580 / ラテ 650円

#表参道カフェ #パンケーキ #東京カフェ`;

test("Instagramによくあるキャプションから情報を抜き出す", () => {
  const r = analyzeText(caption);
  assert.equal(r.genre, "cafe");
  assert.equal(r.placeName, "Cafe Lumière 表参道");
  assert.equal(r.address, "東京都渋谷区神宮前4-12-10");
  assert.equal(r.prefecture, "東京都");
  assert.equal(r.city, "渋谷区神宮前4-12-10");
  assert.equal(r.station, "表参道駅");
  assert.equal(r.walkMin, 5);
  assert.equal(r.priceMin, 650);
  assert.equal(r.priceMax, 1580);
  assert.equal(r.hours, "10:00〜19:00");
  assert.equal(r.closed, "火曜日");
  assert.deepEqual(r.tags, ["表参道カフェ", "パンケーキ", "東京カフェ"]);
});

test("値段: 無料・万円・年号は誤検出しない", () => {
  assert.deepEqual(extractPrice("入場無料のイベント 2026年10月開催"), { priceMin: 0, priceMax: 0, priceNote: "無料" });
  assert.equal(extractPrice("1泊2.5万円の宿").priceMin, 25000);
  assert.equal(extractPrice("2026年にオープン").priceMin, null);
});

test("ジャンル分類", () => {
  assert.equal(classifyGenre("箱根の露天風呂付き客室がある旅館 #温泉"), "stay");
  assert.equal(classifyGenre("夜景がきれいな展望台"), "nature");
  assert.equal(classifyGenre("期間限定のポップアップイベント開催中"), "event");
  assert.equal(classifyGenre("絶品焼肉ディナー"), "gourmet");
  assert.equal(classifyGenre("こんにちは"), "other");
});

test("OGP と JSON-LD を読む", () => {
  const html = `<html><head><title>fallback</title>
    <meta property="og:title" content="焼肉 たろう &amp; はなこ">
    <meta property="og:description" content="和牛ランチ ¥2,000〜">
    <meta property="og:image" content="https://example.com/a.jpg">
    <script type="application/ld+json">{"@type":"Restaurant","name":"焼肉たろう","address":{"addressRegion":"大阪府","addressLocality":"大阪市北区","streetAddress":"梅田1-1"},"geo":{"latitude":34.70,"longitude":135.49},"priceRange":"¥3,000～¥3,999"}</script>
  </head></html>`;
  const p = parseHtml(html);
  assert.equal(p.title, "焼肉 たろう & はなこ");
  assert.equal(p.image, "https://example.com/a.jpg");
  assert.equal(p.ld.name, "焼肉たろう");
  assert.equal(p.ld.address, "大阪府大阪市北区梅田1-1");
  assert.equal(p.lat, 34.7);
});

test("URLの正規化とSNS判定", () => {
  assert.equal(normalizeUrl("見て！ https://www.instagram.com/p/ABC123/?igsh=xyz&utm_source=ig"), "https://www.instagram.com/p/ABC123/");
  assert.equal(detectPlatform("https://vt.tiktok.com/ZS123/"), "tiktok");
  assert.equal(detectPlatform("https://x.com/user/status/1"), "x");
  assert.equal(detectPlatform("https://tabelog.com/tokyo/A1301/"), "tabelog");
  assert.equal(normalizeUrl("URLなし"), "");
});

test("Instagram の og:description から本文だけ取り出す", () => {
  const raw = `1,234 likes, 56 comments - cafe_lover on June 1, 2026: "表参道の新しいカフェ📍東京都渋谷区神宮前".`;
  assert.equal(cleanCaption("instagram", raw), "表参道の新しいカフェ📍東京都渋谷区神宮前");
});

test("移動時間の目安は距離が延びると長くなる", () => {
  const shibuya = { lat: 35.658, lng: 139.7016 };
  const near = estimateTravel(shibuya, { lat: 35.6654, lng: 139.7121 }); // 表参道
  const mid = estimateTravel(shibuya, { lat: 35.4437, lng: 139.638 }); // 横浜
  const far = estimateTravel(shibuya, { lat: 35.0116, lng: 135.7681 }); // 京都
  assert.ok(near.walk != null && near.best <= 25);
  assert.ok(mid.best > near.best && mid.best < 90);
  assert.ok(far.train > 120 && far.train < 400);
  let prev = 0;
  for (let km = 0.5; km < 600; km += 0.5) {
    const t = estimateTravel({ lat: 35, lng: 139 }, { lat: 35 + km / 111, lng: 139 });
    assert.ok(t.train >= prev, `電車の時間が ${km}km で逆転しています`);
    prev = t.train;
  }
});

test("表示用フォーマット", () => {
  assert.equal(formatPrice({ priceMin: 1000, priceMax: 3000 }), "¥1,000〜¥3,000");
  assert.equal(formatPrice({ priceMin: 0, priceMax: 0 }), "無料");
  assert.equal(formatPrice({ priceMin: null, priceMax: null }), "");
  assert.equal(formatMinutes(45), "45分");
  assert.equal(formatMinutes(95), "1時間35分");
});

test("まとめて入力（手入力のメモ書き）", async () => {
  const { parseFreeform, extractDeadline } = await import("../lib/analyze.js");
  const now = new Date("2026-10-03T12:00:00");
  const r = parseFreeform(`カフェ ルミエール
渋谷区神宮前4-12-10 表参道駅 徒歩5分
1,500円くらい 11時〜20時 火曜休み
10/31までの限定パフェ`, now);
  assert.equal(r.placeName, "カフェ ルミエール");
  assert.equal(r.genre, "cafe");
  assert.equal(r.station, "表参道駅");
  assert.equal(r.walkMin, 5);
  assert.equal(r.city, "渋谷区神宮前4-12-10", "市区町村は番地まで");
  assert.equal(r.priceMin, 1500);
  assert.equal(r.hours, "11時〜20時");
  assert.equal(r.closed, "火曜");
  assert.equal(r.deadline, "2026-10-31");
  assert.equal(r.address, "渋谷区神宮前4-12-10");
  assert.equal(r.memo, "10/31までの限定パフェ", "住所の行はメモに入れない");

  const one = parseFreeform("焼肉たろう、新宿駅、5000円、17:00-23:00、日曜定休、記念日に行きたい", now);
  assert.equal(one.placeName, "焼肉たろう");
  assert.equal(one.genre, "gourmet");
  assert.equal(one.station, "新宿駅");
  assert.equal(one.priceMin, 5000);
  assert.equal(one.hours, "17:00-23:00");
  assert.equal(one.closed, "日曜");
  assert.equal(one.memo, "記念日に行きたい");

  const labeled = parseFreeform("店名：パーラー苺\nメモ：苺のパフェが有名\nhttps://www.instagram.com/p/ABC/?igsh=x", now);
  assert.equal(labeled.placeName, "パーラー苺");
  assert.equal(labeled.memo, "苺のパフェが有名");
  assert.equal(labeled.url, "https://www.instagram.com/p/ABC/");
  assert.equal(labeled.platform, "instagram");

  assert.equal(extractDeadline("〜1/15", now), "2027-01-15", "過ぎた月日は来年");
  assert.equal(extractDeadline("2026年12月25日まで", now), "2026-12-25");
  assert.equal(extractDeadline("11/3(火)まで", now), "2026-11-03");
  assert.equal(extractDeadline("1500円", now), "");
});

test("市区町村は住所の最後まで（建物名も）", async () => {
  const { analyzeText, cityShort, cityFromAddress } = await import("../lib/analyze.js");
  const r = analyzeText("住所：〒150-0001 東京都渋谷区神宮前4-12-10 表参道ヒルズ本館3F");
  assert.equal(r.prefecture, "東京都");
  assert.equal(r.city, "渋谷区神宮前4-12-10 表参道ヒルズ本館3F");
  const r2 = analyzeText("📍大阪府大阪市北区梅田1-1-3 大阪駅前第1ビル 2階");
  assert.equal(r2.city, "大阪市北区梅田1-1-3 大阪駅前第1ビル");
  assert.equal(cityShort("渋谷区神宮前4-12-10"), "渋谷区");
  assert.equal(cityShort("足柄下郡箱根町湯本"), "足柄下郡箱根町");
  assert.equal(cityFromAddress("神奈川県鎌倉市雪ノ下2-1-31"), "鎌倉市雪ノ下2-1-31");
  const r3 = analyzeText("住所：京都府京都市右京区嵯峨天龍寺芒ノ馬場町68 嵐山駅から徒歩7分 湯豆腐コース 3,500円");
  assert.equal(r3.city, "京都市右京区嵯峨天龍寺芒ノ馬場町68", "後ろに続く文は市区町村に入れない");
});

test("AIの答えのチェック", async () => {
  const { cleanAiResult } = await import("../lib/analyze.js");
  const r = cleanAiResult({ placeName: " 焼肉たろう ", address: "東京都新宿区西新宿1-1-1", prefecture: "東京", city: "新宿区", station: "新宿", genre: "yakiniku", priceMin: 6000, priceMax: 3000, deadline: "2026-13-40", walkMin: 5, lat: 10, lng: 10 });
  assert.equal(r.placeName, "焼肉たろう");
  assert.equal(r.prefecture, "東京都");
  assert.equal(r.city, "新宿区西新宿1-1-1");
  assert.equal(r.station, "新宿駅");
  assert.equal(r.genre, "other");
  assert.deepEqual([r.priceMin, r.priceMax], [3000, 6000]);
  assert.equal(r.deadline, "");
  assert.equal(r.lat, undefined);
});

test("1行のメモ：スペース区切りの店名・座標・値段を取り違えない", async () => {
  const { parseFreeform } = await import("../lib/analyze.js");
  const a = parseFreeform("カフェ ルミエール 渋谷区神宮前4-12-10 表参道駅 徒歩5分 1500円くらい 35.6672, 139.7087");
  assert.equal(a.placeName, "カフェ ルミエール");
  assert.equal(a.address, "渋谷区神宮前4-12-10");
  assert.equal(a.walkMin, 5);
  const b = parseFreeform("パンケーキ屋 ブルーム 原宿駅 1200円");
  assert.equal(b.placeName, "パンケーキ屋 ブルーム");
  assert.equal(b.walkMin, null);
  assert.equal(b.priceMin, 1200);
});
