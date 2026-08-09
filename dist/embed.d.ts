import { type DynamicColorPolicy, type DynamicColorSource } from "./colors.js";
export declare const EMBED_THEMES: readonly ["info", "success", "warning", "error", "neutral"];
export type EmbedTheme = (typeof EMBED_THEMES)[number];
export type EmbedThemePalette = Readonly<Record<EmbedTheme, number>>;
export declare const DEFAULT_EMBED_THEME_COLORS: EmbedThemePalette;
export declare const EMBED_LIMITS: Readonly<{
    title: 256;
    description: 4096;
    fields: 25;
    fieldName: 256;
    fieldValue: 1024;
    footerText: 2048;
    authorName: 256;
    totalText: 6000;
    url: 2048;
}>;
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
export type EmbedValidationCode = "EMBED_EMPTY_TEXT" | "EMBED_TEXT_LIMIT_EXCEEDED" | "EMBED_FIELD_LIMIT_EXCEEDED" | "EMBED_TOTAL_TEXT_LIMIT_EXCEEDED" | "EMBED_INVALID_COLOR" | "EMBED_INVALID_FIELD" | "EMBED_INVALID_LOCALE" | "EMBED_INVALID_TIMESTAMP" | "EMBED_INVALID_URL" | "EMBED_URL_NOT_ALLOWED";
export interface EmbedValidationIssue {
    readonly code: EmbedValidationCode;
    readonly path: string;
    readonly message: string;
    readonly actual?: number | string;
    readonly limit?: number;
}
export declare class EmbedValidationError extends Error {
    readonly issues: readonly EmbedValidationIssue[];
    constructor(issues: readonly EmbedValidationIssue[]);
}
export interface EmbedUrlPolicy {
    readonly allowedHosts?: readonly string[];
}
export interface EmbedPlanValidationOptions {
    readonly urlPolicy?: EmbedUrlPolicy;
}
export interface EmbedBuilderOptions {
    readonly locale?: string;
    readonly palette?: EmbedThemePalette;
    readonly urlPolicy?: EmbedUrlPolicy;
}
export declare const calculateEmbedTextLength: (plan: EmbedPlan) => number;
/**
 * Reprojects an untrusted structural value into one closed, validated plan.
 * Provider adapters call this even for TypeScript-typed input so JS callers,
 * casts, getters and custom toJSON behavior cannot bypass engine limits.
 */
export declare const validateEmbedPlan: (input: unknown, options?: EmbedPlanValidationOptions) => EmbedPlan;
export declare class EmbedPlanBuilder {
    #private;
    private constructor();
    static create(theme?: EmbedTheme, options?: EmbedBuilderOptions): EmbedPlanBuilder;
    static info(options?: EmbedBuilderOptions): EmbedPlanBuilder;
    static success(options?: EmbedBuilderOptions): EmbedPlanBuilder;
    static warning(options?: EmbedBuilderOptions): EmbedPlanBuilder;
    static error(options?: EmbedBuilderOptions): EmbedPlanBuilder;
    static neutral(options?: EmbedBuilderOptions): EmbedPlanBuilder;
    private next;
    locale(locale: string): EmbedPlanBuilder;
    color(color: number): EmbedPlanBuilder;
    dynamicColor(context: Readonly<Record<string, DynamicColorSource>>, policy: DynamicColorPolicy): EmbedPlanBuilder;
    title(title: string): EmbedPlanBuilder;
    description(description: string): EmbedPlanBuilder;
    url(url: string): EmbedPlanBuilder;
    timestamp(timestamp: string | Date): EmbedPlanBuilder;
    author(author: EmbedAuthor): EmbedPlanBuilder;
    footer(footer: EmbedFooter): EmbedPlanBuilder;
    thumbnail(url: string): EmbedPlanBuilder;
    image(url: string): EmbedPlanBuilder;
    field(name: string, value: string, inline?: boolean): EmbedPlanBuilder;
    build(): EmbedPlan;
}
//# sourceMappingURL=embed.d.ts.map