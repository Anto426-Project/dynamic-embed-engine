export interface EmbedMarkupFormatOptions {
  readonly bullet?: string;
  readonly maximumInputLength?: number;
}

const DEFAULT_MAXIMUM_INPUT_LENGTH = 12_000;

const protectCodeBlocks = (
  input: string,
): Readonly<{ text: string; blocks: readonly string[] }> => {
  const blocks: string[] = [];
  const text = input.replace(
    /\[code(?::([\w.+-]+))?\]([\s\S]*?)\[\/code\]/giu,
    (_match, language: string | undefined, body: string) => {
      const index = blocks.length;
      blocks.push(`\`\`\`${language ?? ""}\n${body.replace(/^\n|\n$/gu, "")}\n\`\`\``);
      return `\u0000EMBED_CODE_${index}\u0000`;
    },
  );
  return Object.freeze({ text, blocks: Object.freeze(blocks) });
};

const restoreCodeBlocks = (input: string, blocks: readonly string[]): string =>
  input.replace(
    /\u0000EMBED_CODE_(\d+)\u0000/gu,
    (_match, rawIndex: string) => blocks[Number(rawIndex)] ?? "",
  );

const formatQuoteBlocks = (input: string): string =>
  input.replace(/\[quote\]([\s\S]*?)\[\/quote\]/giu, (_match, body: string) =>
    body
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n"),
  );

export const formatEmbedMarkup = (
  input: string,
  options: EmbedMarkupFormatOptions = {},
): string => {
  const maximumInputLength = options.maximumInputLength ?? DEFAULT_MAXIMUM_INPUT_LENGTH;
  if (
    !Number.isSafeInteger(maximumInputLength) ||
    maximumInputLength < 1 ||
    maximumInputLength > 100_000
  ) {
    throw new RangeError("maximumInputLength must be an integer from 1 to 100000.");
  }
  if (input.length > maximumInputLength) {
    throw new RangeError("Embed markup input exceeds its configured limit.");
  }
  if (input.includes("\u0000")) {
    throw new TypeError("Embed markup input cannot contain NUL characters.");
  }
  const bullet = options.bullet?.trim() || "•";
  if (bullet.length > 8) throw new RangeError("Embed markup bullet is too long.");
  const normalized = input
    .replace(/\r\n?/gu, "\n")
    .replaceAll("\\n", "\n")
    .replaceAll("\\t", "\t");
  const protectedCode = protectCodeBlocks(normalized);

  let formatted = formatQuoteBlocks(protectedCode.text)
    .replace(/\[b\]([\s\S]*?)\[\/b\]/giu, "**$1**")
    .replace(/\[i\]([\s\S]*?)\[\/i\]/giu, "*$1*")
    .replace(/\[u\]([\s\S]*?)\[\/u\]/giu, "__$1__")
    .replace(/\[s\]([\s\S]*?)\[\/s\]/giu, "~~$1~~")
    .replace(/\[hr\]/giu, "──────────");

  formatted = formatted
    .split("\n")
    .map((line) => {
      const heading = /^\s*#{1,3}\s+(.+?)\s*$/u.exec(line);
      if (heading?.[1] !== undefined) return `**${heading[1]}**`;
      if (/^\s*[-*+]\s+/u.test(line)) {
        return line.replace(/^\s*[-*+]\s+/u, `${bullet} `);
      }
      if (/^\s*\d+[.)]\s+/u.test(line)) {
        return line.replace(/^\s*(\d+)[.)]\s+/u, "$1) ");
      }
      return line.replace(/[ \t]+$/gu, "");
    })
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  return restoreCodeBlocks(formatted, protectedCode.blocks);
};
