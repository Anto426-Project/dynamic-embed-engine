import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatEmbedMarkup } from "../src/index.js";

describe("embed authoring markup", () => {
  it("renders the bounded provider-neutral authoring subset", () => {
    assert.equal(
      formatEmbedMarkup("# Title\n- one\n[b]bold[/b]\n[quote]safe[/quote]"),
      "**Title**\n• one\n**bold**\n> safe",
    );
  });

  it("protects code blocks and rejects placeholder injection", () => {
    assert.equal(
      formatEmbedMarkup("[code:ts]\nconst x = '[b]literal[/b]';\n[/code]"),
      "```ts\nconst x = '[b]literal[/b]';\n```",
    );
    assert.throws(() => formatEmbedMarkup("bad\u0000input"), /NUL/);
  });

  it("rejects unbounded input", () => {
    assert.throws(
      () => formatEmbedMarkup("1234", { maximumInputLength: 3 }),
      /exceeds/,
    );
  });
});
