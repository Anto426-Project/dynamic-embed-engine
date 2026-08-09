import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const collect = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory()
          ? collect(target)
          : entry.isFile() && entry.name.endsWith(".ts")
            ? [target]
            : [];
      }),
    )
  ).flat();
};

describe("provider-neutral architecture", () => {
  it("contains no product, provider, infrastructure or ambient runtime dependency", async () => {
    const source = (
      await Promise.all((await collect(path.resolve("src"))).map((file) => readFile(file, "utf8")))
    ).join("\n");
    for (const forbidden of [
      /\bantobot\b/iu,
      /\bunibot\b/iu,
      /\buniapp\b/iu,
      /\buniversity[-_ ]?platform\b/iu,
      /\baccess[-_ ]?broker\b/iu,
      /\bcoredb\b/iu,
      /from\s+["']discord\.js["']/u,
      /from\s+["']node:(?:fs|http|https|net)[^"']*["']/u,
      /\bprocess\.env\b/u,
      /\bfetch\s*\(/u,
      /\bformatEmbedMarkup\b/u,
      /\bescapeUntrustedEmbedText\b/u,
      /\ballowedProtocols\b/u,
    ]) {
      assert.doesNotMatch(source, forbidden);
    }
  });
});
