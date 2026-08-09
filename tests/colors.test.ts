import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blendEmbedColors,
  deriveDynamicColorProfile,
  dynamicColorPolicy,
  embedColorToRgb,
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
    assert.throws(() => rgbToEmbedColor([256, 0, 0]), /between 0 and 255/);
    assert.throws(() => rgbToEmbedColor([-1, 0, 0]), /between 0 and 255/);
    assert.throws(() => rgbToEmbedColor([Number.NaN, 0, 0]), /between 0 and 255/);
  });

  it("derives one representative profile independently of sample order", () => {
    const samples = [
      [79, 98, 14],
      [235, 53, 3],
      [36, 71, 216],
      [76, 154, 239],
      [14, 173, 95],
    ] as const;
    const reordered = [samples[2], samples[0], samples[4], samples[1], samples[3]];
    const first = deriveDynamicColorProfile(samples);
    const second = deriveDynamicColorProfile(reordered);

    assert.deepEqual(first, second);
    assert.ok(new Set(first.palette.map((color) => color.join(","))).size > 1);
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
    assert.throws(
      () => deriveDynamicColorProfile(new Array(10_001) as number[][]),
      /between 1 and/,
    );

    const samples = [[1, 2, 3]];
    Object.defineProperty(samples, "map", {
      value: () => {
        throw new Error("overridden map must not run");
      },
    });
    assert.equal(deriveDynamicColorProfile(samples).averageColor, 0x01_02_03);

    const accessorSample = [1, 2, 3];
    Object.defineProperty(accessorSample, "0", {
      enumerable: true,
      get: () => {
        throw new Error("RGB accessor must not run");
      },
    });
    assert.throws(() => deriveDynamicColorProfile([accessorSample]), /dense numeric data/);
  });

  it("bounds palette selection work to the requested color count", () => {
    const samples = Array.from({ length: 10_000 }, (_, index) => [
      index % 256,
      (index * 17) % 256,
      (index * 31) % 256,
    ]);
    const started = performance.now();
    const profile = deriveDynamicColorProfile(samples, {
      colorCount: 5,
      minimumDistance: 0,
    });
    assert.equal(profile.palette.length, 5);
    assert.ok(performance.now() - started < 1_000);
  });

});
