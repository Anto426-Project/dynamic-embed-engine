import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMBED_LIMITS,
  EmbedPlanBuilder,
  EmbedValidationError,
  calculateEmbedTextLength,
  deriveDynamicColorProfile,
  escapeUntrustedEmbedText,
  validateEmbedPlan,
} from "../src/index.js";

describe("embed plan engine", () => {
  it("builds immutable plans without mutating earlier builder states", () => {
    const base = EmbedPlanBuilder.info();
    const titled = base.title("Status");
    const complete = titled.field("Health", "Operational", true);

    assert.equal(base.build().title, undefined);
    assert.equal(titled.build().fields.length, 0);
    const plan = complete.build();
    assert.deepEqual(plan.fields, [{ name: "Health", value: "Operational", inline: true }]);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.fields), true);
  });

  it("applies a dynamic profile through a named context", () => {
    const profile = deriveDynamicColorProfile([[20, 40, 60]]);
    const plan = EmbedPlanBuilder.success()
      .dynamicColor(
        { requester: { profile } },
        { source: "context", key: "requester", blendRatio: 0 },
      )
      .description("Ready")
      .build();
    assert.equal(plan.color, profile.averageColor);
  });

  it("enforces HTTPS and optional host allowlists", () => {
    const options = {
      urlPolicy: {
        allowedProtocols: ["https:"],
        allowedHosts: ["cdn.example.test"],
      },
    } as const;
    assert.equal(
      EmbedPlanBuilder.info(options)
        .image("https://cdn.example.test/image.png")
        .build().imageUrl,
      "https://cdn.example.test/image.png",
    );
    assert.throws(
      () =>
        EmbedPlanBuilder.info(options)
          .image("https://other.example.test/image.png")
          .build(),
      EmbedValidationError,
    );
  });

  it("enforces field and aggregate Discord-compatible text limits", () => {
    let builder = EmbedPlanBuilder.neutral().description("x".repeat(4_000));
    for (let index = 0; index < 3; index += 1) {
      builder = builder.field(`field-${index}`, "y".repeat(800));
    }
    assert.throws(() => builder.build(), /invalid/);

    const exact = EmbedPlanBuilder.neutral()
      .description("x".repeat(EMBED_LIMITS.description))
      .field("n".repeat(100), "v".repeat(1_024))
      .field("m".repeat(100), "w".repeat(680))
      .build();
    assert.equal(calculateEmbedTextLength(exact), EMBED_LIMITS.totalText);
  });

  it("escapes markdown controls and neutralizes mentions", () => {
    assert.equal(
      escapeUntrustedEmbedText("**@everyone** [click](url)"),
      "\\*\\*@\u200beveryone\\*\\* \\[click\\]\\(url\\)",
    );
  });

  it("revalidates structural input and rejects accessor bypasses", () => {
    const valid = EmbedPlanBuilder.info().description("safe").build();
    assert.deepEqual(validateEmbedPlan({ ...valid }), valid);
    const malicious = {
      ...valid,
      get description() {
        return "x".repeat(50_000);
      },
    };
    assert.throws(() => validateEmbedPlan(malicious), /accessor/);
    assert.throws(
      () => validateEmbedPlan({ ...valid, description: "x".repeat(50_000) }),
      EmbedValidationError,
    );
  });
});
