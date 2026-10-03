// （任意）ANTHROPIC_API_KEY が設定されていれば Claude で投稿内容を読み取り、
// ルールベースの推定結果を上書きする。キーがなければ何もしない。

import { GENRES } from "./analyze.js";

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
      const schema = z.object({
        placeName: z.string().describe("店名・施設名・スポット名。不明なら空文字"),
        address: z.string().describe("住所（都道府県から）。不明なら空文字"),
        prefecture: z.string(),
        city: z.string().describe("市区町村"),
        station: z.string().describe("最寄り駅（〜駅）。不明なら空文字"),
        genre: z.enum(GENRES.map((g) => g.id)),
        priceMin: z.number().nullable().describe("1人あたりの最低価格（円）。無料なら0、不明ならnull"),
        priceMax: z.number().nullable(),
        hours: z.string().describe("営業時間・開催期間。不明なら空文字"),
        summary: z.string().describe("どんな場所か、ふたりで行く目線で40字以内の要約"),
      });
      return { client: new Anthropic(), format: zodOutputFormat(schema) };
    })();
  }
  return clientPromise;
}

export async function aiExtract({ url, platform, title, caption }) {
  if (!aiEnabled()) return null;
  try {
    const { client, format } = await getClient();
    const genreList = GENRES.map((g) => `${g.id}=${g.label}`).join(", ");
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low", format },
      messages: [
        {
          role: "user",
          content:
            `SNSの投稿から、行ってみたいお出かけ先の情報を抜き出してください。ジャンルは次から1つ選びます: ${genreList}\n` +
            `投稿に書かれていないことは推測で埋めず、空文字かnullにしてください。\n\n` +
            `<post platform="${platform}" url="${url}">\n<title>${title}</title>\n<caption>${caption}</caption>\n</post>`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output || null;
  } catch (e) {
    console.warn("[ai] 解析に失敗したのでルールベースの結果を使います:", e.message);
    return null;
  }
}
