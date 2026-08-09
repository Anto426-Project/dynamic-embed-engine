import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blendEmbedColors,
  deriveDynamicColorProfile,
  dynamicColorPolicy,
  embedColorToRgb,
  firstDefinedHttpsSource,
  resolveDynamicColor,
  rgbToEmbedColor,
} from "../src/index.js";

describe("dynamic color engine", () => {
  it("derives one deterministic, deeply frozen profile", () => {
    const samples = [
      [16, 32, 48],
      [64, 80, 96],
      [120, 24, 200],
      [230, 220, 210],
    ] as const;
    const first = deriveDynamicColorProfile(samples);
    const second = deriveDynamicColorProfile(samples);

    assert.deepEqual(first, second);
    assert.equal(first.palette.length, 5);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.palette), true);
    assert.equal(Object.isFrozen(first.palette[0]), true);
  });

  it("keeps RGB conversion and blending bounded", () => {
    assert.deepEqual(embedColorToRgb(0x12_34_56), [0x12, 0x34, 0x56]);
    assert.equal(rgbToEmbedColor([0x12, 0x34, 0x56]), 0x12_34_56);
    assert.equal(blendEmbedColors(0x00_00_00, 0xff_ff_ff, 0.5), 0x80_80_80);
    assert.throws(() => blendEmbedColors(0, 0, 2), /between 0 and 1/);
  });

  it("resolves profile and contextual color without provider state", () => {
    const profile = deriveDynamicColorProfile([[20, 40, 60]]);
    const fromProfile = resolveDynamicColor(
      0xff_00_00,
      {},
      dynamicColorPolicy(profile, 0),
    );
    const fromContext = resolveDynamicColor(
      0xff_00_00,
      { actor: { accentColor: 0x00_ff_00 } },
      { source: "context", key: "actor", blendRatio: 0 },
    );

    assert.equal(fromProfile, profile.averageColor);
    assert.equal(fromContext, 0x00_ff_00);
  });

  it("rejects unbounded or malformed samples", () => {
    assert.throws(() => deriveDynamicColorProfile([]), /between 1 and/);
    assert.throws(() => deriveDynamicColorProfile([[1, 2]]), /exactly three/);
    assert.throws(() => deriveDynamicColorProfile([[1, 2, 999]]), /between 0 and 255/);
  });

  it("selects only credential-free HTTPS sources", () => {
    assert.equal(
      firstDefinedHttpsSource([
        "http://unsafe.example/image.png",
        "https://user:pass@example.test/private.png",
        "https://cdn.example.test/image.png",
      ]),
      "https://cdn.example.test/image.png",
    );
  });
});
