import { assertEmbedColor, resolveDynamicColor, } from "./colors.js";
export const EMBED_THEMES = [
    "info",
    "success",
    "warning",
    "error",
    "neutral",
];
export const DEFAULT_EMBED_THEME_COLORS = Object.freeze({
    info: 0x3b_82_f6,
    success: 0x22_c5_5e,
    warning: 0xf5_9e_0b,
    error: 0xef_44_44,
    neutral: 0x64_74_8b,
});
export const EMBED_LIMITS = Object.freeze({
    title: 256,
    description: 4_096,
    fields: 25,
    fieldName: 256,
    fieldValue: 1_024,
    footerText: 2_048,
    authorName: 256,
    totalText: 6_000,
    url: 2_048,
});
export class EmbedValidationError extends Error {
    issues;
    constructor(issues) {
        super(`The embed plan is invalid: ${issues.map((issue) => issue.path).join(", ")}.`);
        this.issues = issues;
        this.name = "EmbedValidationError";
    }
}
const DEFAULT_URL_POLICY = Object.freeze({});
const MAXIMUM_ALLOWED_HOSTS = 256;
const normalizeAllowedHost = (value, index) => {
    const host = value.trim();
    if (host.length === 0 || host.length > 253 || /[/?#]/u.test(host)) {
        throw new TypeError(`Embed URL policy host ${index} is invalid.`);
    }
    let parsed;
    try {
        parsed = new URL(`https://${host}/`);
    }
    catch {
        throw new TypeError(`Embed URL policy host ${index} is invalid.`);
    }
    if (parsed.hostname.length === 0 ||
        parsed.username.length > 0 ||
        parsed.password.length > 0 ||
        parsed.port.length > 0 ||
        parsed.pathname !== "/" ||
        parsed.search.length > 0 ||
        parsed.hash.length > 0) {
        throw new TypeError(`Embed URL policy host ${index} is invalid.`);
    }
    return parsed.hostname.toLowerCase();
};
const freezePolicy = (policy) => {
    const values = policy.allowedHosts;
    if (values === undefined)
        return DEFAULT_URL_POLICY;
    if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype) {
        throw new TypeError("Embed URL policy allowedHosts must be a plain array.");
    }
    if (values.length > MAXIMUM_ALLOWED_HOSTS) {
        throw new RangeError(`Embed URL policy can contain at most ${MAXIMUM_ALLOWED_HOSTS} allowed hosts.`);
    }
    const hosts = [];
    for (let index = 0; index < values.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
        if (descriptor === undefined ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined ||
            descriptor.enumerable !== true ||
            typeof descriptor.value !== "string") {
            throw new TypeError("Embed URL policy allowedHosts must be a dense string array.");
        }
        hosts.push(normalizeAllowedHost(descriptor.value, index));
    }
    return Object.freeze({ allowedHosts: Object.freeze([...new Set(hosts)]) });
};
const issueForText = (value, path, limit) => {
    if (value.trim().length === 0) {
        return { code: "EMBED_EMPTY_TEXT", path, message: "The value cannot be empty." };
    }
    if (value.length > limit) {
        return {
            code: "EMBED_TEXT_LIMIT_EXCEEDED",
            path,
            message: `The value exceeds the ${limit} character limit.`,
            actual: value.length,
            limit,
        };
    }
    return undefined;
};
const isBoundedLocale = (value) => {
    if (value.length < 2 ||
        value.length > 64 ||
        !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u.test(value)) {
        return false;
    }
    try {
        new Intl.Locale(value);
        return true;
    }
    catch {
        return false;
    }
};
const normalizeUrl = (value, path, policy, issues) => {
    if (value.length > EMBED_LIMITS.url) {
        issues.push({
            code: "EMBED_TEXT_LIMIT_EXCEEDED",
            path,
            message: `The URL exceeds the ${EMBED_LIMITS.url} character limit.`,
            actual: value.length,
            limit: EMBED_LIMITS.url,
        });
        return undefined;
    }
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        issues.push({ code: "EMBED_INVALID_URL", path, message: "The value must be an absolute URL." });
        return undefined;
    }
    const normalized = parsed.toString();
    if (normalized.length > EMBED_LIMITS.url) {
        issues.push({
            code: "EMBED_TEXT_LIMIT_EXCEEDED",
            path,
            message: `The normalized URL exceeds the ${EMBED_LIMITS.url} character limit.`,
            actual: normalized.length,
            limit: EMBED_LIMITS.url,
        });
        return undefined;
    }
    const normalizedHost = parsed.hostname.toLowerCase();
    const isAttachment = parsed.protocol === "attachment:" &&
        (path === "imageUrl" || path === "thumbnailUrl");
    const allowed = (parsed.protocol === "https:" || isAttachment) &&
        parsed.username.length === 0 &&
        parsed.password.length === 0 &&
        (isAttachment || policy.allowedHosts === undefined || policy.allowedHosts.includes(normalizedHost));
    if (!allowed) {
        issues.push({
            code: "EMBED_URL_NOT_ALLOWED",
            path,
            message: "The URL protocol, host or embedded credentials are not allowed.",
        });
        return undefined;
    }
    return normalized;
};
export const calculateEmbedTextLength = (plan) => (plan.title?.length ?? 0) +
    (plan.description?.length ?? 0) +
    (plan.author?.name.length ?? 0) +
    (plan.footer?.text.length ?? 0) +
    plan.fields.reduce((total, field) => total + field.name.length + field.value.length, 0);
const validateDraft = (draft) => {
    const issues = [];
    if (!isBoundedLocale(draft.locale)) {
        issues.push({
            code: "EMBED_INVALID_LOCALE",
            path: "locale",
            message: "Locale must be a bounded BCP-47 language tag.",
        });
    }
    try {
        assertEmbedColor(draft.color);
    }
    catch {
        issues.push({
            code: "EMBED_INVALID_COLOR",
            path: "color",
            message: "Color must be an integer RGB value.",
            actual: draft.color,
        });
    }
    const textValues = [
        ...(draft.title === undefined ? [] : [[draft.title, "title", EMBED_LIMITS.title]]),
        ...(draft.description === undefined
            ? []
            : [[draft.description, "description", EMBED_LIMITS.description]]),
        ...(draft.author === undefined
            ? []
            : [[draft.author.name, "author.name", EMBED_LIMITS.authorName]]),
        ...(draft.footer === undefined
            ? []
            : [[draft.footer.text, "footer.text", EMBED_LIMITS.footerText]]),
    ];
    for (const [value, path, limit] of textValues) {
        const issue = issueForText(value, path, limit);
        if (issue !== undefined)
            issues.push(issue);
    }
    if (draft.fields.length > EMBED_LIMITS.fields) {
        issues.push({
            code: "EMBED_FIELD_LIMIT_EXCEEDED",
            path: "fields",
            message: `An embed can contain at most ${EMBED_LIMITS.fields} fields.`,
            actual: draft.fields.length,
            limit: EMBED_LIMITS.fields,
        });
    }
    for (const [index, field] of draft.fields.entries()) {
        if (typeof field.inline !== "boolean") {
            issues.push({
                code: "EMBED_INVALID_FIELD",
                path: `fields[${index}].inline`,
                message: "Field inline must be a boolean.",
            });
        }
        for (const [value, path, limit] of [
            [field.name, `fields[${index}].name`, EMBED_LIMITS.fieldName],
            [field.value, `fields[${index}].value`, EMBED_LIMITS.fieldValue],
        ]) {
            const issue = issueForText(value, path, limit);
            if (issue !== undefined)
                issues.push(issue);
        }
    }
    const urls = {
        url: draft.url,
        "author.url": draft.author?.url,
        "author.iconUrl": draft.author?.iconUrl,
        "footer.iconUrl": draft.footer?.iconUrl,
        thumbnailUrl: draft.thumbnailUrl,
        imageUrl: draft.imageUrl,
    };
    const normalizedUrls = {};
    for (const [path, value] of Object.entries(urls)) {
        if (value !== undefined) {
            const normalized = normalizeUrl(value, path, draft.urlPolicy, issues);
            if (normalized !== undefined)
                normalizedUrls[path] = normalized;
        }
    }
    const candidate = {
        theme: draft.theme,
        locale: draft.locale,
        color: draft.color,
        ...(draft.title === undefined ? {} : { title: draft.title }),
        ...(draft.description === undefined ? {} : { description: draft.description }),
        ...(normalizedUrls.url === undefined ? {} : { url: normalizedUrls.url }),
        ...(draft.timestamp === undefined ? {} : { timestamp: draft.timestamp }),
        ...(draft.author === undefined
            ? {}
            : {
                author: Object.freeze({
                    name: draft.author.name,
                    ...(normalizedUrls["author.url"] === undefined
                        ? {}
                        : { url: normalizedUrls["author.url"] }),
                    ...(normalizedUrls["author.iconUrl"] === undefined
                        ? {}
                        : { iconUrl: normalizedUrls["author.iconUrl"] }),
                }),
            }),
        ...(draft.footer === undefined
            ? {}
            : {
                footer: Object.freeze({
                    text: draft.footer.text,
                    ...(normalizedUrls["footer.iconUrl"] === undefined
                        ? {}
                        : { iconUrl: normalizedUrls["footer.iconUrl"] }),
                }),
            }),
        ...(normalizedUrls.thumbnailUrl === undefined
            ? {}
            : { thumbnailUrl: normalizedUrls.thumbnailUrl }),
        ...(normalizedUrls.imageUrl === undefined ? {} : { imageUrl: normalizedUrls.imageUrl }),
        fields: Object.freeze(draft.fields.map((field) => Object.freeze({ ...field }))),
    };
    if (draft.timestamp !== undefined) {
        const parsed = new Date(draft.timestamp);
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== draft.timestamp) {
            issues.push({
                code: "EMBED_INVALID_TIMESTAMP",
                path: "timestamp",
                message: "Timestamp must be canonical ISO-8601 UTC.",
            });
        }
    }
    const total = calculateEmbedTextLength(candidate);
    if (total > EMBED_LIMITS.totalText) {
        issues.push({
            code: "EMBED_TOTAL_TEXT_LIMIT_EXCEEDED",
            path: "embed",
            message: `Total embed text exceeds ${EMBED_LIMITS.totalText} characters.`,
            actual: total,
            limit: EMBED_LIMITS.totalText,
        });
    }
    if (issues.length > 0) {
        throw new EmbedValidationError(Object.freeze(issues.map((issue) => Object.freeze({ ...issue }))));
    }
    return Object.freeze(candidate);
};
const EMBED_PLAN_KEYS = Object.freeze(new Set([
    "theme",
    "locale",
    "color",
    "title",
    "description",
    "url",
    "timestamp",
    "author",
    "footer",
    "thumbnailUrl",
    "imageUrl",
    "fields",
]));
const EMBED_AUTHOR_KEYS = Object.freeze(new Set(["name", "url", "iconUrl"]));
const EMBED_FOOTER_KEYS = Object.freeze(new Set(["text", "iconUrl"]));
const EMBED_FIELD_KEYS = Object.freeze(new Set(["name", "value", "inline"]));
const dataRecord = (value, path, allowedKeys) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${path} must be a plain data object.`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} must be a plain data object.`);
    }
    const snapshot = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string" || !allowedKeys.has(key)) {
            throw new TypeError(`${path} contains an unknown property.`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined ||
            descriptor.enumerable !== true) {
            throw new TypeError(`${path} cannot contain accessor properties.`);
        }
        snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
};
const boundedDataArray = (value, path, maximumLength) => {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError(`${path} must be a plain data array.`);
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor === undefined ||
        typeof lengthDescriptor.value !== "number" ||
        !Number.isSafeInteger(lengthDescriptor.value)) {
        throw new TypeError(`${path} has an invalid length.`);
    }
    const length = lengthDescriptor.value;
    if (length > maximumLength) {
        throw new EmbedValidationError(Object.freeze([
            Object.freeze({
                code: "EMBED_FIELD_LIMIT_EXCEEDED",
                path,
                message: `An embed can contain at most ${maximumLength} fields.`,
                actual: length,
                limit: maximumLength,
            }),
        ]));
    }
    const values = [];
    for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined ||
            descriptor.enumerable !== true) {
            throw new TypeError(`${path} must be a dense plain data array.`);
        }
        values.push(descriptor.value);
    }
    return Object.freeze(values);
};
const requiredString = (record, key, path) => {
    const value = record[key];
    if (typeof value !== "string")
        throw new TypeError(`${path}.${key} must be a string.`);
    return value;
};
const optionalString = (record, key, path) => {
    const value = record[key];
    if (value === undefined)
        return undefined;
    if (typeof value !== "string")
        throw new TypeError(`${path}.${key} must be a string.`);
    return value;
};
/**
 * Reprojects an untrusted structural value into one closed, validated plan.
 * Provider adapters call this even for TypeScript-typed input so JS callers,
 * casts, getters and custom toJSON behavior cannot bypass engine limits.
 */
export const validateEmbedPlan = (input, options = {}) => {
    const plan = dataRecord(input, "embed", EMBED_PLAN_KEYS);
    const themeValue = requiredString(plan, "theme", "embed");
    if (!EMBED_THEMES.includes(themeValue)) {
        throw new TypeError("embed.theme is invalid.");
    }
    const color = plan["color"];
    if (typeof color !== "number")
        throw new TypeError("embed.color must be a number.");
    const fieldsValue = plan["fields"];
    const fieldValues = boundedDataArray(fieldsValue, "embed.fields", EMBED_LIMITS.fields);
    const fields = [];
    for (let index = 0; index < fieldValues.length; index += 1) {
        const field = dataRecord(fieldValues[index], `embed.fields[${index}]`, EMBED_FIELD_KEYS);
        if (typeof field["inline"] !== "boolean") {
            throw new TypeError(`embed.fields[${index}].inline must be a boolean.`);
        }
        fields.push(Object.freeze({
            name: requiredString(field, "name", `embed.fields[${index}]`),
            value: requiredString(field, "value", `embed.fields[${index}]`),
            inline: field["inline"],
        }));
    }
    const authorValue = plan["author"];
    const author = authorValue === undefined
        ? undefined
        : (() => {
            const value = dataRecord(authorValue, "embed.author", EMBED_AUTHOR_KEYS);
            return Object.freeze({
                name: requiredString(value, "name", "embed.author"),
                ...(optionalString(value, "url", "embed.author") === undefined
                    ? {}
                    : { url: optionalString(value, "url", "embed.author") }),
                ...(optionalString(value, "iconUrl", "embed.author") === undefined
                    ? {}
                    : { iconUrl: optionalString(value, "iconUrl", "embed.author") }),
            });
        })();
    const footerValue = plan["footer"];
    const footer = footerValue === undefined
        ? undefined
        : (() => {
            const value = dataRecord(footerValue, "embed.footer", EMBED_FOOTER_KEYS);
            return Object.freeze({
                text: requiredString(value, "text", "embed.footer"),
                ...(optionalString(value, "iconUrl", "embed.footer") === undefined
                    ? {}
                    : { iconUrl: optionalString(value, "iconUrl", "embed.footer") }),
            });
        })();
    return validateDraft({
        theme: themeValue,
        locale: requiredString(plan, "locale", "embed"),
        color,
        urlPolicy: freezePolicy(options.urlPolicy ?? DEFAULT_URL_POLICY),
        ...(optionalString(plan, "title", "embed") === undefined
            ? {}
            : { title: optionalString(plan, "title", "embed") }),
        ...(optionalString(plan, "description", "embed") === undefined
            ? {}
            : { description: optionalString(plan, "description", "embed") }),
        ...(optionalString(plan, "url", "embed") === undefined
            ? {}
            : { url: optionalString(plan, "url", "embed") }),
        ...(optionalString(plan, "timestamp", "embed") === undefined
            ? {}
            : { timestamp: optionalString(plan, "timestamp", "embed") }),
        ...(author === undefined ? {} : { author }),
        ...(footer === undefined ? {} : { footer }),
        ...(optionalString(plan, "thumbnailUrl", "embed") === undefined
            ? {}
            : { thumbnailUrl: optionalString(plan, "thumbnailUrl", "embed") }),
        ...(optionalString(plan, "imageUrl", "embed") === undefined
            ? {}
            : { imageUrl: optionalString(plan, "imageUrl", "embed") }),
        fields: Object.freeze(fields),
    });
};
export class EmbedPlanBuilder {
    #draft;
    constructor(draft) {
        this.#draft = Object.freeze({ ...draft });
        Object.freeze(this);
    }
    static create(theme = "neutral", options = {}) {
        if (!EMBED_THEMES.includes(theme))
            throw new TypeError("Unknown embed theme.");
        const palette = options.palette ?? DEFAULT_EMBED_THEME_COLORS;
        for (const entry of EMBED_THEMES)
            assertEmbedColor(palette[entry], `palette.${entry}`);
        return new EmbedPlanBuilder({
            theme,
            locale: options.locale ?? "und",
            color: palette[theme],
            urlPolicy: freezePolicy(options.urlPolicy ?? DEFAULT_URL_POLICY),
            fields: Object.freeze([]),
        });
    }
    static info(options) {
        return EmbedPlanBuilder.create("info", options);
    }
    static success(options) {
        return EmbedPlanBuilder.create("success", options);
    }
    static warning(options) {
        return EmbedPlanBuilder.create("warning", options);
    }
    static error(options) {
        return EmbedPlanBuilder.create("error", options);
    }
    static neutral(options) {
        return EmbedPlanBuilder.create("neutral", options);
    }
    next(changes) {
        return new EmbedPlanBuilder({ ...this.#draft, ...changes });
    }
    locale(locale) {
        return this.next({ locale: locale.trim() });
    }
    color(color) {
        return this.next({ color });
    }
    dynamicColor(context, policy) {
        return this.next({ color: resolveDynamicColor(this.#draft.color, context, policy) });
    }
    title(title) {
        return this.next({ title });
    }
    description(description) {
        return this.next({ description });
    }
    url(url) {
        return this.next({ url });
    }
    timestamp(timestamp) {
        return this.next({
            timestamp: timestamp instanceof Date && Number.isFinite(timestamp.getTime())
                ? timestamp.toISOString()
                : timestamp instanceof Date
                    ? ""
                    : timestamp,
        });
    }
    author(author) {
        return this.next({ author: Object.freeze({ ...author }) });
    }
    footer(footer) {
        return this.next({ footer: Object.freeze({ ...footer }) });
    }
    thumbnail(url) {
        return this.next({ thumbnailUrl: url });
    }
    image(url) {
        return this.next({ imageUrl: url });
    }
    field(name, value, inline = false) {
        return this.next({
            fields: Object.freeze([...this.#draft.fields, Object.freeze({ name, value, inline })]),
        });
    }
    build() {
        return validateDraft(this.#draft);
    }
}
//# sourceMappingURL=embed.js.map