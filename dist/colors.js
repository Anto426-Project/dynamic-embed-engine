const DEFAULT_COLOR_COUNT = 5;
const DEFAULT_BLEND_RATIO = 0.3;
const MAX_SAMPLES = 10_000;
export const assertEmbedColor = (value, label = "color") => {
    if (!Number.isInteger(value) || value < 0 || value > 0xff_ff_ff) {
        throw new RangeError(`${label} must be an integer from 0x000000 to 0xFFFFFF.`);
    }
    return value;
};
export const blendEmbedColors = (base, overlay, overlayRatio) => {
    assertEmbedColor(base, "base");
    assertEmbedColor(overlay, "overlay");
    if (!Number.isFinite(overlayRatio) || overlayRatio < 0 || overlayRatio > 1) {
        throw new RangeError("overlayRatio must be between 0 and 1.");
    }
    const blendChannel = (shift) => {
        const baseChannel = (base >> shift) & 0xff;
        const overlayChannel = (overlay >> shift) & 0xff;
        return Math.round(baseChannel + (overlayChannel - baseChannel) * overlayRatio);
    };
    return (blendChannel(16) << 16) | (blendChannel(8) << 8) | blendChannel(0);
};
const assertChannel = (value, path) => {
    if (!Number.isFinite(value) || value < 0 || value > 255) {
        throw new RangeError(`${path} must be between 0 and 255.`);
    }
    return Math.round(value);
};
const freezeRgb = (color, path) => {
    if (!Array.isArray(color) || Object.getPrototypeOf(color) !== Array.prototype) {
        throw new TypeError(`${path} must be a plain RGB data array.`);
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(color, "length");
    if (lengthDescriptor?.value !== 3) {
        throw new RangeError(`${path} must contain exactly three RGB channels.`);
    }
    const channels = [];
    for (let index = 0; index < 3; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(color, String(index));
        if (descriptor === undefined ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined ||
            descriptor.enumerable !== true ||
            typeof descriptor.value !== "number") {
            throw new TypeError(`${path} must contain three dense numeric data channels.`);
        }
        channels.push(assertChannel(descriptor.value, `${path}.${["red", "green", "blue"][index]}`));
    }
    return Object.freeze([
        channels[0],
        channels[1],
        channels[2],
    ]);
};
const freezeSamples = (samples) => {
    if (!Array.isArray(samples) || Object.getPrototypeOf(samples) !== Array.prototype) {
        throw new TypeError("RGB samples must be a plain data array.");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(samples, "length");
    const length = lengthDescriptor?.value;
    if (!Number.isSafeInteger(length) || length < 1 || length > MAX_SAMPLES) {
        throw new RangeError(`RGB samples must contain between 1 and ${MAX_SAMPLES} entries.`);
    }
    const normalized = [];
    for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(samples, String(index));
        if (descriptor === undefined ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined ||
            descriptor.enumerable !== true ||
            !Array.isArray(descriptor.value)) {
            throw new TypeError("RGB samples must be a dense array of plain RGB data arrays.");
        }
        normalized.push(freezeRgb(descriptor.value, `samples[${index}]`));
    }
    return Object.freeze(normalized);
};
export const rgbToEmbedColor = (color) => {
    const normalized = freezeRgb(color, "color");
    return (normalized[0] << 16) | (normalized[1] << 8) | normalized[2];
};
export const embedColorToRgb = (color) => {
    assertEmbedColor(color);
    return Object.freeze([
        (color >> 16) & 0xff,
        (color >> 8) & 0xff,
        color & 0xff,
    ]);
};
const brightness = (color) => Math.sqrt(0.299 * color[0] ** 2 +
    0.587 * color[1] ** 2 +
    0.114 * color[2] ** 2);
const colorDistance = (left, right) => Math.sqrt((left[0] - right[0]) ** 2 +
    (left[1] - right[1]) ** 2 +
    (left[2] - right[2]) ** 2);
const compareRgb = (left, right) => brightness(left) - brightness(right) ||
    left[0] - right[0] ||
    left[1] - right[1] ||
    left[2] - right[2];
const sortedByBrightness = (palette) => [...palette].sort(compareRgb);
const uniqueColors = (palette) => {
    const seen = new Set();
    return Object.freeze(sortedByBrightness(palette).filter((color) => {
        const key = `${color[0]},${color[1]},${color[2]}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    }));
};
const defaultMinimumDistance = (palette) => {
    if (palette.length < 2)
        return 0;
    const ordered = sortedByBrightness(palette);
    const totals = ordered.reduce((sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]], [0, 0, 0]);
    const center = Object.freeze([
        totals[0] / ordered.length,
        totals[1] / ordered.length,
        totals[2] / ordered.length,
    ]);
    return Math.round(ordered.reduce((total, color) => total + colorDistance(color, center), 0) / ordered.length);
};
const distinctColors = (palette, minimumDistance, maximumCount) => {
    const sorted = uniqueColors(palette);
    const first = sorted[0];
    if (first === undefined)
        return Object.freeze([]);
    if (maximumCount === 1) {
        const average = averageColor(sorted);
        const closest = [...sorted].sort((left, right) => colorDistance(left, average) - colorDistance(right, average) || compareRgb(left, right))[0];
        return Object.freeze([closest]);
    }
    const selected = [first];
    const selectedKeys = new Set([`${first[0]},${first[1]},${first[2]}`]);
    while (selected.length < maximumCount) {
        let best;
        let bestDistance = -1;
        for (const candidate of sorted) {
            const key = `${candidate[0]},${candidate[1]},${candidate[2]}`;
            if (selectedKeys.has(key))
                continue;
            const distance = Math.min(...selected.map((existing) => colorDistance(candidate, existing)));
            if (distance > bestDistance ||
                (distance === bestDistance && best !== undefined && compareRgb(candidate, best) < 0)) {
                best = candidate;
                bestDistance = distance;
            }
        }
        if (best === undefined || bestDistance < minimumDistance)
            break;
        selected.push(best);
        selectedKeys.add(`${best[0]},${best[1]},${best[2]}`);
    }
    return Object.freeze(sortedByBrightness(selected));
};
const interpolate = (start, end, ratio) => Object.freeze([
    Math.round(start[0] + (end[0] - start[0]) * ratio),
    Math.round(start[1] + (end[1] - start[1]) * ratio),
    Math.round(start[2] + (end[2] - start[2]) * ratio),
]);
const gradientThrough = (controlPoints, count) => {
    if (controlPoints.length === 1) {
        return Object.freeze(Array.from({ length: count }, () => controlPoints[0]));
    }
    return Object.freeze(Array.from({ length: count }, (_, index) => {
        const position = (index / (count - 1)) * (controlPoints.length - 1);
        const segment = Math.min(Math.floor(position), controlPoints.length - 2);
        return interpolate(controlPoints[segment], controlPoints[segment + 1], position - segment);
    }));
};
const averageColor = (palette) => {
    const totals = palette.reduce((sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]], [0, 0, 0]);
    return Object.freeze([
        Math.round(totals[0] / palette.length),
        Math.round(totals[1] / palette.length),
        Math.round(totals[2] / palette.length),
    ]);
};
const rgbToHsl = (color) => {
    const red = color[0] / 255;
    const green = color[1] / 255;
    const blue = color[2] / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const lightness = (maximum + minimum) / 2;
    if (maximum === minimum)
        return Object.freeze([0, 0, lightness]);
    const delta = maximum - minimum;
    const saturation = lightness > 0.5
        ? delta / (2 - maximum - minimum)
        : delta / (maximum + minimum);
    let hue;
    if (maximum === red) {
        hue = (green - blue) / delta + (green < blue ? 6 : 0);
    }
    else if (maximum === green) {
        hue = (blue - red) / delta + 2;
    }
    else {
        hue = (red - green) / delta + 4;
    }
    return Object.freeze([hue / 6, saturation, lightness]);
};
const hueChannel = (lower, upper, input) => {
    let hue = input;
    if (hue < 0)
        hue += 1;
    if (hue > 1)
        hue -= 1;
    if (hue < 1 / 6)
        return lower + (upper - lower) * 6 * hue;
    if (hue < 1 / 2)
        return upper;
    if (hue < 2 / 3)
        return lower + (upper - lower) * (2 / 3 - hue) * 6;
    return lower;
};
const hslToRgb = (color) => {
    const [hue, saturation, lightness] = color;
    if (saturation === 0) {
        const channel = Math.round(lightness * 255);
        return Object.freeze([channel, channel, channel]);
    }
    const upper = lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation;
    const lower = 2 * lightness - upper;
    return Object.freeze([
        Math.round(hueChannel(lower, upper, hue + 1 / 3) * 255),
        Math.round(hueChannel(lower, upper, hue) * 255),
        Math.round(hueChannel(lower, upper, hue - 1 / 3) * 255),
    ]);
};
const withSaturation = (color, factor) => {
    const [hue, saturation, lightness] = rgbToHsl(color);
    return hslToRgb([hue, Math.max(0, Math.min(1, saturation * factor)), lightness]);
};
const withLightnessOffset = (color, offset) => {
    const [hue, saturation, lightness] = rgbToHsl(color);
    return hslToRgb([hue, saturation, Math.max(0, Math.min(1, lightness + offset))]);
};
const readableTextColor = (palette) => {
    const sorted = sortedByBrightness(palette);
    const darkest = sorted[0];
    const lightest = sorted.at(-1);
    const backgroundBrightness = sorted.reduce((total, color) => total + brightness(color), 0) / sorted.length;
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
export const deriveDynamicColorProfile = (samples, options = {}) => {
    const colorCount = options.colorCount ?? DEFAULT_COLOR_COUNT;
    if (!Number.isInteger(colorCount) || colorCount < 1 || colorCount > 20) {
        throw new RangeError("colorCount must be an integer from 1 to 20.");
    }
    const normalized = freezeSamples(samples);
    const minimumDistance = options.minimumDistance ?? defaultMinimumDistance(normalized);
    if (!Number.isFinite(minimumDistance) || minimumDistance < 0 || minimumDistance > 442) {
        throw new RangeError("minimumDistance must be between 0 and 442.");
    }
    const distinct = distinctColors(normalized, minimumDistance, colorCount);
    const unique = uniqueColors(normalized);
    const finalPalette = (() => {
        if (colorCount === 1)
            return Object.freeze([averageColor(normalized)]);
        if (distinct.length >= colorCount)
            return Object.freeze(distinct.slice(0, colorCount));
        const controlPoints = distinct.length >= 2
            ? sortedByBrightness(distinct)
            : Object.freeze([unique[0], unique.at(-1)]);
        return gradientThrough(controlPoints, colorCount);
    })();
    const average = averageColor(finalPalette);
    const accent = [...finalPalette].sort((left, right) => rgbToHsl(right)[1] - rgbToHsl(left)[1])[0] ??
        average;
    const [accentHue, accentSaturation, accentLightness] = rgbToHsl(accent);
    const vibrant = withSaturation(accent, 1.3);
    return Object.freeze({
        palette: Object.freeze(finalPalette),
        textColor: rgbToEmbedColor(readableTextColor(finalPalette)),
        averageColor: rgbToEmbedColor(average),
        accentColor: rgbToEmbedColor(accent),
        complementaryAccent: rgbToEmbedColor(hslToRgb([
            (accentHue + 0.5) % 1,
            Math.min(1, accentSaturation * 1.2),
            accentLightness,
        ])),
        triadicColors: Object.freeze([
            rgbToEmbedColor(hslToRgb([(accentHue + 1 / 3) % 1, accentSaturation, accentLightness])),
            rgbToEmbedColor(hslToRgb([(accentHue + 2 / 3) % 1, accentSaturation, accentLightness])),
        ]),
        vibrantColor: rgbToEmbedColor(vibrant),
        mutedColor: rgbToEmbedColor(withSaturation(accent, 0.4)),
        glowColor: rgbToEmbedColor(withLightnessOffset(vibrant, accentLightness < 0.5 ? 0.25 : -0.25)),
    });
};
export const resolveDynamicColor = (themeColor, context, policy = { source: "theme" }) => {
    assertEmbedColor(themeColor, "themeColor");
    switch (policy.source) {
        case "theme":
            return themeColor;
        case "manual":
            return assertEmbedColor(policy.color);
        case "profile":
            return blendEmbedColors(policy.profile.averageColor, themeColor, policy.blendRatio ?? DEFAULT_BLEND_RATIO);
        case "context": {
            const source = context[policy.key];
            const dynamic = source?.profile?.averageColor ?? source?.accentColor;
            return dynamic === undefined
                ? themeColor
                : blendEmbedColors(dynamic, themeColor, policy.blendRatio ?? DEFAULT_BLEND_RATIO);
        }
    }
};
export const dynamicColorPolicy = (profile, blendRatio = DEFAULT_BLEND_RATIO) => profile === null
    ? Object.freeze({ source: "theme" })
    : Object.freeze({ source: "profile", profile, blendRatio });
//# sourceMappingURL=colors.js.map