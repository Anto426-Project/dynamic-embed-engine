export type RgbColor = readonly [red: number, green: number, blue: number];

export interface DynamicColorProfile {
  readonly palette: readonly RgbColor[];
  readonly textColor: number;
  readonly averageColor: number;
  readonly accentColor: number;
  readonly complementaryAccent: number;
  readonly triadicColors: readonly [number, number];
  readonly vibrantColor: number;
  readonly mutedColor: number;
  readonly glowColor: number;
}

export interface DeriveDynamicColorOptions {
  readonly colorCount?: number;
  readonly minimumDistance?: number;
}

export type DynamicColorSource = Readonly<{
  readonly accentColor?: number;
  readonly profile?: DynamicColorProfile;
}>;

export type DynamicColorPolicy =
  | Readonly<{ source: "theme" }>
  | Readonly<{
      source: "profile";
      profile: DynamicColorProfile;
      blendRatio?: number;
    }>
  | Readonly<{
      source: "context";
      key: string;
      blendRatio?: number;
    }>
  | Readonly<{ source: "manual"; color: number }>;

const DEFAULT_COLOR_COUNT = 5;
const DEFAULT_BLEND_RATIO = 0.3;
const MAX_SAMPLES = 10_000;

export const assertEmbedColor = (value: number, label = "color"): number => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff_ff_ff) {
    throw new RangeError(`${label} must be an integer from 0x000000 to 0xFFFFFF.`);
  }
  return value;
};

export const blendEmbedColors = (
  base: number,
  overlay: number,
  overlayRatio: number,
): number => {
  assertEmbedColor(base, "base");
  assertEmbedColor(overlay, "overlay");
  if (!Number.isFinite(overlayRatio) || overlayRatio < 0 || overlayRatio > 1) {
    throw new RangeError("overlayRatio must be between 0 and 1.");
  }

  const blendChannel = (shift: number): number => {
    const baseChannel = (base >> shift) & 0xff;
    const overlayChannel = (overlay >> shift) & 0xff;
    return Math.round(baseChannel + (overlayChannel - baseChannel) * overlayRatio);
  };

  return (blendChannel(16) << 16) | (blendChannel(8) << 8) | blendChannel(0);
};

const assertChannel = (value: number, path: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new RangeError(`${path} must be between 0 and 255.`);
  }
  return Math.round(value);
};

const freezeRgb = (color: readonly number[], path: string): RgbColor => {
  if (color.length !== 3) {
    throw new RangeError(`${path} must contain exactly three RGB channels.`);
  }
  return Object.freeze([
    assertChannel(color[0] as number, `${path}.red`),
    assertChannel(color[1] as number, `${path}.green`),
    assertChannel(color[2] as number, `${path}.blue`),
  ]);
};

export const rgbToEmbedColor = (color: RgbColor): number =>
  (color[0] << 16) | (color[1] << 8) | color[2];

export const embedColorToRgb = (color: number): RgbColor => {
  assertEmbedColor(color);
  return Object.freeze([
    (color >> 16) & 0xff,
    (color >> 8) & 0xff,
    color & 0xff,
  ]);
};

const brightness = (color: RgbColor): number =>
  Math.sqrt(
    0.299 * color[0] ** 2 +
      0.587 * color[1] ** 2 +
      0.114 * color[2] ** 2,
  );

const colorDistance = (left: RgbColor, right: RgbColor): number =>
  Math.sqrt(
    (left[0] - right[0]) ** 2 +
      (left[1] - right[1]) ** 2 +
      (left[2] - right[2]) ** 2,
  );

const averageDistance = (palette: readonly RgbColor[]): number => {
  if (palette.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < palette.length - 1; index += 1) {
    const current = palette[index];
    const next = palette[index + 1];
    if (current !== undefined && next !== undefined) {
      total += colorDistance(current, next);
    }
  }
  return Math.round(total / (palette.length - 1));
};

const sortedByBrightness = (palette: readonly RgbColor[]): readonly RgbColor[] =>
  [...palette].sort((left, right) => brightness(left) - brightness(right));

const distinctColors = (
  palette: readonly RgbColor[],
  minimumDistance: number,
  maximumCount: number,
): readonly RgbColor[] => {
  const sorted = sortedByBrightness(palette);
  const first = sorted[0];
  if (first === undefined) return Object.freeze([]);
  const selected: RgbColor[] = [first];
  for (const candidate of sorted.slice(1)) {
    if (selected.every((existing) => colorDistance(candidate, existing) >= minimumDistance)) {
      selected.push(candidate);
      if (selected.length >= maximumCount) break;
    }
  }
  return Object.freeze(selected);
};

const interpolate = (start: RgbColor, end: RgbColor, ratio: number): RgbColor =>
  Object.freeze([
    Math.round(start[0] + (end[0] - start[0]) * ratio),
    Math.round(start[1] + (end[1] - start[1]) * ratio),
    Math.round(start[2] + (end[2] - start[2]) * ratio),
  ]);

const gradient = (
  start: RgbColor,
  end: RgbColor,
  count: number,
): readonly RgbColor[] =>
  count === 1
    ? Object.freeze([start])
    : Object.freeze(
        Array.from({ length: count }, (_, index) =>
          interpolate(start, end, index / (count - 1)),
        ),
      );

const averageColor = (palette: readonly RgbColor[]): RgbColor => {
  const totals = palette.reduce(
    (sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]],
    [0, 0, 0],
  );
  return Object.freeze([
    Math.round(totals[0] / palette.length),
    Math.round(totals[1] / palette.length),
    Math.round(totals[2] / palette.length),
  ]);
};

type HslColor = readonly [hue: number, saturation: number, lightness: number];

const rgbToHsl = (color: RgbColor): HslColor => {
  const red = color[0] / 255;
  const green = color[1] / 255;
  const blue = color[2] / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  if (maximum === minimum) return Object.freeze([0, 0, lightness]);

  const delta = maximum - minimum;
  const saturation =
    lightness > 0.5
      ? delta / (2 - maximum - minimum)
      : delta / (maximum + minimum);
  let hue: number;
  if (maximum === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (maximum === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }
  return Object.freeze([hue / 6, saturation, lightness]);
};

const hueChannel = (lower: number, upper: number, input: number): number => {
  let hue = input;
  if (hue < 0) hue += 1;
  if (hue > 1) hue -= 1;
  if (hue < 1 / 6) return lower + (upper - lower) * 6 * hue;
  if (hue < 1 / 2) return upper;
  if (hue < 2 / 3) return lower + (upper - lower) * (2 / 3 - hue) * 6;
  return lower;
};

const hslToRgb = (color: HslColor): RgbColor => {
  const [hue, saturation, lightness] = color;
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return Object.freeze([channel, channel, channel]);
  }
  const upper =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const lower = 2 * lightness - upper;
  return Object.freeze([
    Math.round(hueChannel(lower, upper, hue + 1 / 3) * 255),
    Math.round(hueChannel(lower, upper, hue) * 255),
    Math.round(hueChannel(lower, upper, hue - 1 / 3) * 255),
  ]);
};

const withSaturation = (color: RgbColor, factor: number): RgbColor => {
  const [hue, saturation, lightness] = rgbToHsl(color);
  return hslToRgb([hue, Math.max(0, Math.min(1, saturation * factor)), lightness]);
};

const withLightnessOffset = (color: RgbColor, offset: number): RgbColor => {
  const [hue, saturation, lightness] = rgbToHsl(color);
  return hslToRgb([hue, saturation, Math.max(0, Math.min(1, lightness + offset))]);
};

const readableTextColor = (palette: readonly RgbColor[]): RgbColor => {
  const sorted = sortedByBrightness(palette);
  const darkest = sorted[0] as RgbColor;
  const lightest = sorted.at(-1) as RgbColor;
  const backgroundBrightness =
    sorted.reduce((total, color) => total + brightness(color), 0) / sorted.length;
  const selected = backgroundBrightness > 128 ? darkest : lightest;
  const [hue, saturation, lightness] = rgbToHsl(selected);
  if (saturation < 0.1) {
    return backgroundBrightness < 128
      ? Object.freeze([255, 255, 255])
      : Object.freeze([0, 0, 0]);
  }
  return hslToRgb([
    hue,
    saturation,
    backgroundBrightness < 128 && lightness < 0.65
      ? 0.85
      : backgroundBrightness >= 128 && lightness > 0.35
        ? 0.15
        : lightness,
  ]);
};

export const deriveDynamicColorProfile = (
  samples: readonly (readonly number[])[],
  options: DeriveDynamicColorOptions = {},
): DynamicColorProfile => {
  if (samples.length === 0 || samples.length > MAX_SAMPLES) {
    throw new RangeError(`RGB samples must contain between 1 and ${MAX_SAMPLES} entries.`);
  }
  const colorCount = options.colorCount ?? DEFAULT_COLOR_COUNT;
  if (!Number.isInteger(colorCount) || colorCount < 1 || colorCount > 20) {
    throw new RangeError("colorCount must be an integer from 1 to 20.");
  }
  const normalized = Object.freeze(
    samples.map((sample, index) => freezeRgb(sample, `samples[${index}]`)),
  );
  const minimumDistance = options.minimumDistance ?? averageDistance(normalized);
  if (!Number.isFinite(minimumDistance) || minimumDistance < 0 || minimumDistance > 442) {
    throw new RangeError("minimumDistance must be between 0 and 442.");
  }

  const distinct = distinctColors(normalized, minimumDistance, colorCount);
  const sorted = sortedByBrightness(distinct.length === 0 ? normalized : distinct);
  const darkest = sorted[0] as RgbColor;
  const lightest = sorted.at(-1) as RgbColor;
  const finalPalette =
    distinct.length >= colorCount
      ? Object.freeze(distinct.slice(0, colorCount))
      : gradient(darkest, lightest, colorCount);
  const average = averageColor(finalPalette);
  const accent =
    [...finalPalette].sort((left, right) => rgbToHsl(right)[1] - rgbToHsl(left)[1])[0] ??
    average;
  const [accentHue, accentSaturation, accentLightness] = rgbToHsl(accent);
  const vibrant = withSaturation(accent, 1.3);
  return Object.freeze({
    palette: Object.freeze(finalPalette),
    textColor: rgbToEmbedColor(readableTextColor(finalPalette)),
    averageColor: rgbToEmbedColor(average),
    accentColor: rgbToEmbedColor(accent),
    complementaryAccent: rgbToEmbedColor(
      hslToRgb([
        (accentHue + 0.5) % 1,
        Math.min(1, accentSaturation * 1.2),
        accentLightness,
      ]),
    ),
    triadicColors: Object.freeze([
      rgbToEmbedColor(hslToRgb([(accentHue + 1 / 3) % 1, accentSaturation, accentLightness])),
      rgbToEmbedColor(hslToRgb([(accentHue + 2 / 3) % 1, accentSaturation, accentLightness])),
    ] as const),
    vibrantColor: rgbToEmbedColor(vibrant),
    mutedColor: rgbToEmbedColor(withSaturation(accent, 0.4)),
    glowColor: rgbToEmbedColor(
      withLightnessOffset(vibrant, accentLightness < 0.5 ? 0.25 : -0.25),
    ),
  });
};

export const resolveDynamicColor = (
  themeColor: number,
  context: Readonly<Record<string, DynamicColorSource>>,
  policy: DynamicColorPolicy = { source: "theme" },
): number => {
  assertEmbedColor(themeColor, "themeColor");
  switch (policy.source) {
    case "theme":
      return themeColor;
    case "manual":
      return assertEmbedColor(policy.color);
    case "profile":
      return blendEmbedColors(
        policy.profile.averageColor,
        themeColor,
        policy.blendRatio ?? DEFAULT_BLEND_RATIO,
      );
    case "context": {
      const source = context[policy.key];
      const dynamic = source?.profile?.averageColor ?? source?.accentColor;
      return dynamic === undefined
        ? themeColor
        : blendEmbedColors(dynamic, themeColor, policy.blendRatio ?? DEFAULT_BLEND_RATIO);
    }
  }
};

export const dynamicColorPolicy = (
  profile: DynamicColorProfile | null,
  blendRatio = DEFAULT_BLEND_RATIO,
): DynamicColorPolicy =>
  profile === null
    ? Object.freeze({ source: "theme" })
    : Object.freeze({ source: "profile", profile, blendRatio });

export const firstDefinedHttpsSource = (
  sources: readonly (string | null | undefined)[],
): string | undefined => {
  for (const value of sources) {
    if (value === null || value === undefined || value.trim().length === 0) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      continue;
    }
    if (
      parsed.protocol === "https:" &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
    ) {
      return parsed.toString();
    }
  }
  return undefined;
};
