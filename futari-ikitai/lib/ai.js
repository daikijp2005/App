// （任意）ANTHROPIC_API_KEY が設定されていれば Claude で投稿内容を読み取る。キーがなければ何もしない。
// 読み取り（aiExtract）・うろ覚え検索（aiAsk）・具体的な行き方（aiRoute）の3つ。

import { GENRES } from "./analyze.js";
import { GENRE_GUIDE, EXTRACT_RULES, ROUTE_RULES, hintsText } from "./prompts.js";

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
let clientPromise = null;

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
      const { z } = await import("zod/v4");
      return { client: new Anthropic(), zodOutputFormat, z };
    })();
  }
  return clientPromise;
}

const formats = {};
async function format(name, build) {
  const { zodOutputFormat, z } = await getClient();
  if (!formats[name]) formats[name] = zodOutputFormat(build(z));
  return formats[name];
}


export async function aiExtract({ url, platform, title, caption, image = null, hints = null }) {
  if (!aiEnabled()) return null;
  try {
    const { client } = await getClient();
    const fmt = await format("extract", (z) => z.object({
      placeName: z.string(), address: z.string(), prefecture: z.string(), city: z.string(), station: z.string(),
      walkMin: z.number().nullable(), genre: z.enum(GENRES.map((g) => g.id)),
      priceMin: z.number().nullable(), priceMax: z.number().nullable(),
      hours: z.string(), closed: z.string(), deadline: z.string(), summary: z.string(),
    }));
    const response = await client.messages.parse({
      model: MODEL(),
      max_tokens: 4000,
      output_config: { effort: "medium", format: fmt },
      messages: [{
        role: "user",
        content: [
          ...(image ? [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }] : []),
          {
            type: "text",
            text:
              `SNSの投稿から、行きたいお出かけ先の情報を抜き出してください。今日は ${new Date().toISOString().slice(0, 10)} です。\n` +
              (image ? "添付画像は投稿のスクリーンショットです。写っている文字（店名・住所・価格・営業時間）も読んでください。\n" : "") +
              `\n${EXTRACT_RULES}\n\n<genres>\n${GENRE_GUIDE}\n</genres>\n\n` +
              `<post platform="${platform}" url="${url}">\n<title>${title}</title>\n<caption>${caption}</caption>\n</post>` + hintsText(hints),
          },
        ],
      }],
    });
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output || null;
  } catch (e) {
    console.warn("[ai] 解析に失敗したのでルールベースの結果を使います:", e.message);
    return null;
  }
}

// うろ覚えの質問に当てはまりそうなスポットを選んでもらう
export async function aiAsk(question, items) {
  if (!aiEnabled()) return null;
  const { client } = await getClient();
  const fmt = await format("ask", (z) => z.object({ picks: z.array(z.object({ id: z.string(), reason: z.string() })).max(5) }));
  const response = await client.messages.parse({
    model: MODEL(),
    max_tokens: 3000,
    output_config: { effort: "medium", format: fmt },
    messages: [{
      role: "user",
      content: `行きたい場所を貯めたリストがあります。うろ覚えの質問に当てはまりそうな場所を、当てはまる順に最大5つ選んでください。\n` +
        `言いかえ（「海」→ビーチ・海辺、「甘いもの」→スイーツ）や、追加した人・追加した時期・値段・エリアの条件も考えてください。当てはまるものがなければ空にしてください。\n` +
        `reason は「なぜそれっぽいか」を20字ほどで。\n\n<question>${question}</question>\n<list>${JSON.stringify(items).slice(0, 60000)}</list>`,
    }],
  });
  if (response.stop_reason === "refusal") return [];
  return response.parsed_output?.picks || [];
}

export async function aiRoute({ from, to, mode }) {
  if (!aiEnabled()) return null;
  const { client } = await getClient();
  const fmt = await format("route", (z) => z.object({
    steps: z.array(z.object({ type: z.string(), text: z.string(), minutes: z.number().nullable() })),
    totalMinutes: z.number().nullable(), fareYen: z.number().nullable(), note: z.string(),
  }));
  const response = await client.messages.parse({
    model: MODEL(),
    max_tokens: 4000,
    output_config: { effort: "medium", format: fmt },
    messages: [{
      role: "user",
      content: `${ROUTE_RULES}\n\n<from>${JSON.stringify(from)}</from>\n<to>${JSON.stringify(to)}</to>\n<mode>${mode}</mode>`,
    }],
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output || null;
}
