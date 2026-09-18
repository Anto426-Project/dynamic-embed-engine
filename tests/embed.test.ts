import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMBED_LIMITS,
  EmbedPlanBuilder,
  EmbedValidationError,
  calculateEmbedTextLength,
  deriveDynamicColorProfile,
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
    assert.equal(plan.locale, "und");
    assert.deepEqual(plan.fields, [{ name: "Health", value: "Operational", inline: true }]);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.fields), true);
    assert.equal(Object.isFrozen(plan.fields[0]), true);
    assert.equal(Object.isFrozen(base), true);
    assert.equal("draft" in base, false);
  });

  it("accepts bounded BCP-47 locales and defaults to the neutral und tag", () => {
    assert.equal(EmbedPlanBuilder.info().build().locale, "und");
    assert.equal(EmbedPlanBuilder.info({ locale: "zh-Hans-CN" }).build().locale, "zh-Hans-CN");
    assert.throws(
      () => EmbedPlanBuilder.info({ locale: "en--US" }).build(),
      EmbedValidationError,
    );
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
        allowedHosts: ["cdn.example.test"],
      },
    } as const;
    assert.equal(
      EmbedPlanBuilder.info(options)
        .image("https://cdn.example.test/image.png")
        .build().imageUrl,
      "https://cdn.example.test/image.png",
    );
    assert.equal(
      EmbedPlanBuilder.info(options)
        .image("attachment://welcome-member.png")
        .build().imageUrl,
      "attachment://welcome-member.png",
    );
    assert.equal(
      EmbedPlanBuilder.info({ urlPolicy: { allowedHosts: ["BÜCHER.Example"] } })
        .image("https://BÜCHER.Example/a b")
        .build().imageUrl,
      "https://xn--bcher-kva.example/a%20b",
    );
    assert.throws(
      () =>
        EmbedPlanBuilder.info(options)
          .image("https://other.example.test/image.png")
          .build(),
      EmbedValidationError,
    );
    for (const unsafe of [
      "http://cdn.example.test/image.png",
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "https://user:secret@cdn.example.test/private",
    ]) {
      assert.throws(() => EmbedPlanBuilder.info().image(unsafe).build(), EmbedValidationError);
    }

    const prefix = "https://cdn.example.test/";
    const expanding = prefix + "é".repeat(EMBED_LIMITS.url - prefix.length);
    assert.equal(expanding.length, EMBED_LIMITS.url);
    assert.throws(
      () => EmbedPlanBuilder.info().image(expanding).build(),
      (error: unknown) =>
        error instanceof EmbedValidationError &&
        error.issues.some(
          (issue) => issue.path === "imageUrl" && Number(issue.actual) > EMBED_LIMITS.url,
        ),
    );
  });

  it("enforces canonical field and aggregate text limits", () => {
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

  it("revalidates structural input without invoking overridable array methods", () => {
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

    const overriddenFields: unknown[] = [
      { name: "actual", value: "field", inline: false },
    ];
    Object.defineProperty(overriddenFields, "map", {
      value: () => {
        throw new Error("overridden map must not run");
      },
    });
    assert.deepEqual(
      validateEmbedPlan({ ...valid, fields: overriddenFields }).fields,
      [{ name: "actual", value: "field", inline: false }],
    );
    assert.throws(
      () => validateEmbedPlan({ ...valid, fields: new Array(1_000_000) }),
      EmbedValidationError,
    );
    assert.throws(
      () =>
        validateEmbedPlan({
          ...valid,
          fields: [{ name: "name", value: "value", inline: "not-a-boolean" }],
        }),
      /inline must be a boolean/,
    );
    assert.throws(() => validateEmbedPlan({ ...valid, unexpected: true }), /unknown property/);
  });

  it("revalidates URLs with the adapter host policy", () => {
    const valid = EmbedPlanBuilder.info().image("https://cdn.example.test/image.png").build();
    assert.deepEqual(
      validateEmbedPlan({ ...valid }, { urlPolicy: { allowedHosts: ["cdn.example.test"] } }),
      valid,
    );
    assert.throws(
      () =>
        validateEmbedPlan(
          { ...valid, imageUrl: "https://other.example.test/image.png" },
          { urlPolicy: { allowedHosts: ["cdn.example.test"] } },
        ),
      EmbedValidationError,
    );
  });

  it("reports invalid inline values and dates through embed validation", () => {
    assert.throws(
      () =>
        EmbedPlanBuilder.info()
          .field("name", "value", "not-a-boolean" as unknown as boolean)
          .build(),
      EmbedValidationError,
    );
    assert.throws(
      () => EmbedPlanBuilder.info().timestamp(new Date(Number.NaN)).build(),
      EmbedValidationError,
    );
  });
});
