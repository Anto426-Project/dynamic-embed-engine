import {
  assertEmbedColor,
  resolveDynamicColor,
  type DynamicColorPolicy,
  type DynamicColorSource,
} from "./colors.js";

export const EMBED_THEMES = [
  "info",
  "success",
  "warning",
  "error",
  "neutral",
] as const;

export type EmbedTheme = (typeof EMBED_THEMES)[number];

export type EmbedThemePalette = Readonly<Record<EmbedTheme, number>>;

export const DEFAULT_EMBED_THEME_COLORS: EmbedThemePalette = Object.freeze({
  info: 0x00_e5_ff,
  success: 0x00_f5_a0,
  warning: 0xff_b0_00,
  error: 0xff_38_60,
  neutral: 0x1a_1b_26,
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

export interface EmbedAuthor {
  readonly name: string;
  readonly url?: string;
  readonly iconUrl?: string;
}

export interface EmbedFooter {
  readonly text: string;
  readonly iconUrl?: string;
}

export interface EmbedField {
  readonly name: string;
  readonly value: string;
  readonly inline: boolean;
}

export interface EmbedPlan {
  readonly theme: EmbedTheme;
  readonly locale: string;
  readonly color: number;
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  readonly timestamp?: string;
  readonly author?: EmbedAuthor;
  readonly footer?: EmbedFooter;
  readonly thumbnailUrl?: string;
  readonly imageUrl?: string;
  readonly fields: readonly EmbedField[];
}

export type EmbedValidationCode =
  | "EMBED_EMPTY_TEXT"
  | "EMBED_TEXT_LIMIT_EXCEEDED"
  | "EMBED_FIELD_LIMIT_EXCEEDED"
  | "EMBED_TOTAL_TEXT_LIMIT_EXCEEDED"
  | "EMBED_INVALID_COLOR"
  | "EMBED_INVALID_LOCALE"
  | "EMBED_INVALID_TIMESTAMP"
  | "EMBED_INVALID_URL"
  | "EMBED_URL_NOT_ALLOWED";

export interface EmbedValidationIssue {
  readonly code: EmbedValidationCode;
  readonly path: string;
  readonly message: string;
  readonly actual?: number | string;
  readonly limit?: number;
}

export class EmbedValidationError extends Error {
  public constructor(public readonly issues: readonly EmbedValidationIssue[]) {
    super(`The embed plan is invalid: ${issues.map((issue) => issue.path).join(", ")}.`);
    this.name = "EmbedValidationError";
  }
}

export interface EmbedUrlPolicy {
  readonly allowedProtocols: readonly string[];
  readonly allowedHosts?: readonly string[];
}

export interface EmbedBuilderOptions {
  readonly locale?: string;
  readonly palette?: EmbedThemePalette;
  readonly urlPolicy?: EmbedUrlPolicy;
}

interface EmbedDraft {
  readonly theme: EmbedTheme;
  readonly locale: string;
  readonly color: number;
  readonly urlPolicy: EmbedUrlPolicy;
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  readonly timestamp?: string;
  readonly author?: EmbedAuthor;
  readonly footer?: EmbedFooter;
  readonly thumbnailUrl?: string;
  readonly imageUrl?: string;
  readonly fields: readonly EmbedField[];
}

const DEFAULT_URL_POLICY: EmbedUrlPolicy = Object.freeze({
  allowedProtocols: Object.freeze(["https:"]),
});

const freezePolicy = (policy: EmbedUrlPolicy): EmbedUrlPolicy => {
  if (policy.allowedProtocols.length === 0) {
    throw new TypeError("Embed URL policy requires at least one protocol.");
  }
  const protocols = Object.freeze(
    [...new Set(policy.allowedProtocols.map((value) => value.trim().toLowerCase()))],
  );
  if (protocols.some((protocol) => !/^[a-z][a-z0-9+.-]*:$/.test(protocol))) {
    throw new TypeError("Embed URL policy contains an invalid protocol.");
  }
  const hosts = policy.allowedHosts?.map((host) => host.trim().toLowerCase());
  if (hosts?.some((host) => host.length === 0 || host.includes("/")) === true) {
    throw new TypeError("Embed URL policy contains an invalid host.");
  }
  return Object.freeze({
    allowedProtocols: protocols,
    ...(hosts === undefined ? {} : { allowedHosts: Object.freeze([...new Set(hosts)]) }),
  });
};

const issueForText = (
  value: string,
  path: string,
  limit: number,
): EmbedValidationIssue | undefined => {
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

const normalizeUrl = (
  value: string,
  path: string,
  policy: EmbedUrlPolicy,
  issues: EmbedValidationIssue[],
): string | undefined => {
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
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    issues.push({ code: "EMBED_INVALID_URL", path, message: "The value must be an absolute URL." });
    return undefined;
  }
  const normalizedHost = parsed.hostname.toLowerCase();
  const allowed =
    policy.allowedProtocols.includes(parsed.protocol.toLowerCase()) &&
    parsed.username.length === 0 &&
    parsed.password.length === 0 &&
    (policy.allowedHosts === undefined || policy.allowedHosts.includes(normalizedHost));
  if (!allowed) {
    issues.push({
      code: "EMBED_URL_NOT_ALLOWED",
      path,
      message: "The URL protocol, host or embedded credentials are not allowed.",
    });
    return undefined;
  }
  return parsed.toString();
};

export const calculateEmbedTextLength = (plan: EmbedPlan): number =>
  (plan.title?.length ?? 0) +
  (plan.description?.length ?? 0) +
  (plan.author?.name.length ?? 0) +
  (plan.footer?.text.length ?? 0) +
  plan.fields.reduce((total, field) => total + field.name.length + field.value.length, 0);

const validateDraft = (draft: EmbedDraft): EmbedPlan => {
  const issues: EmbedValidationIssue[] = [];
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(draft.locale)) {
    issues.push({
      code: "EMBED_INVALID_LOCALE",
      path: "locale",
      message: "Locale must be a bounded BCP-47 language tag.",
    });
  }
  try {
    assertEmbedColor(draft.color);
  } catch {
    issues.push({
      code: "EMBED_INVALID_COLOR",
      path: "color",
      message: "Color must be an integer RGB value.",
      actual: draft.color,
    });
  }

  const textValues: readonly (readonly [string, string, number])[] = [
    ...(draft.title === undefined ? [] : [[draft.title, "title", EMBED_LIMITS.title] as const]),
    ...(draft.description === undefined
      ? []
      : [[draft.description, "description", EMBED_LIMITS.description] as const]),
    ...(draft.author === undefined
      ? []
      : [[draft.author.name, "author.name", EMBED_LIMITS.authorName] as const]),
    ...(draft.footer === undefined
      ? []
      : [[draft.footer.text, "footer.text", EMBED_LIMITS.footerText] as const]),
  ];
  for (const [value, path, limit] of textValues) {
    const issue = issueForText(value, path, limit);
    if (issue !== undefined) issues.push(issue);
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
    for (const [value, path, limit] of [
      [field.name, `fields[${index}].name`, EMBED_LIMITS.fieldName],
      [field.value, `fields[${index}].value`, EMBED_LIMITS.fieldValue],
    ] as const) {
      const issue = issueForText(value, path, limit);
      if (issue !== undefined) issues.push(issue);
    }
  }

  const urls = {
    url: draft.url,
    "author.url": draft.author?.url,
    "author.iconUrl": draft.author?.iconUrl,
    "footer.iconUrl": draft.footer?.iconUrl,
    thumbnailUrl: draft.thumbnailUrl,
    imageUrl: draft.imageUrl,
  } as const;
  const normalizedUrls: Partial<Record<keyof typeof urls, string>> = {};
  for (const [path, value] of Object.entries(urls)) {
    if (value !== undefined) {
      const normalized = normalizeUrl(value, path, draft.urlPolicy, issues);
      if (normalized !== undefined) normalizedUrls[path as keyof typeof urls] = normalized;
    }
  }

  const candidate: EmbedPlan = {
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
  if (issues.length > 0) throw new EmbedValidationError(Object.freeze(issues));
  return Object.freeze(candidate);
};

export class EmbedPlanBuilder {
  private constructor(private readonly draft: EmbedDraft) {}

  public static create(
    theme: EmbedTheme = "neutral",
    options: EmbedBuilderOptions = {},
  ): EmbedPlanBuilder {
    if (!EMBED_THEMES.includes(theme)) throw new TypeError("Unknown embed theme.");
    const palette = options.palette ?? DEFAULT_EMBED_THEME_COLORS;
    for (const entry of EMBED_THEMES) assertEmbedColor(palette[entry], `palette.${entry}`);
    return new EmbedPlanBuilder({
      theme,
      locale: options.locale ?? "it",
      color: palette[theme],
      urlPolicy: freezePolicy(options.urlPolicy ?? DEFAULT_URL_POLICY),
      fields: Object.freeze([]),
    });
  }

  public static info(options?: EmbedBuilderOptions): EmbedPlanBuilder {
    return EmbedPlanBuilder.create("info", options);
  }

  public static success(options?: EmbedBuilderOptions): EmbedPlanBuilder {
    return EmbedPlanBuilder.create("success", options);
  }

  public static warning(options?: EmbedBuilderOptions): EmbedPlanBuilder {
    return EmbedPlanBuilder.create("warning", options);
  }

  public static error(options?: EmbedBuilderOptions): EmbedPlanBuilder {
    return EmbedPlanBuilder.create("error", options);
  }

  public static neutral(options?: EmbedBuilderOptions): EmbedPlanBuilder {
    return EmbedPlanBuilder.create("neutral", options);
  }

  private next(changes: Partial<EmbedDraft>): EmbedPlanBuilder {
    return new EmbedPlanBuilder({ ...this.draft, ...changes });
  }

  public locale(locale: string): EmbedPlanBuilder {
    return this.next({ locale: locale.trim() });
  }

  public color(color: number): EmbedPlanBuilder {
    return this.next({ color });
  }

  public dynamicColor(
    context: Readonly<Record<string, DynamicColorSource>>,
    policy: DynamicColorPolicy,
  ): EmbedPlanBuilder {
    return this.next({ color: resolveDynamicColor(this.draft.color, context, policy) });
  }

  public title(title: string): EmbedPlanBuilder {
    return this.next({ title });
  }

  public description(description: string): EmbedPlanBuilder {
    return this.next({ description });
  }

  public url(url: string): EmbedPlanBuilder {
    return this.next({ url });
  }

  public timestamp(timestamp: string | Date): EmbedPlanBuilder {
    return this.next({ timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp });
  }

  public author(author: EmbedAuthor): EmbedPlanBuilder {
    return this.next({ author: Object.freeze({ ...author }) });
  }

  public footer(footer: EmbedFooter): EmbedPlanBuilder {
    return this.next({ footer: Object.freeze({ ...footer }) });
  }

  public thumbnail(url: string): EmbedPlanBuilder {
    return this.next({ thumbnailUrl: url });
  }

  public image(url: string): EmbedPlanBuilder {
    return this.next({ imageUrl: url });
  }

  public field(name: string, value: string, inline = false): EmbedPlanBuilder {
    return this.next({
      fields: Object.freeze([...this.draft.fields, Object.freeze({ name, value, inline })]),
    });
  }

  public build(): EmbedPlan {
    return validateDraft(this.draft);
  }
}

const MARKDOWN_CONTROL_CHARACTERS = /([\\`*_{}[\]()<>#+\-.!|~>])/g;

export const escapeUntrustedEmbedText = (value: string): string =>
  value.replace(MARKDOWN_CONTROL_CHARACTERS, "\\$1").replaceAll("@", "@\u200b");
