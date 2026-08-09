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
export type DynamicColorPolicy = Readonly<{
    source: "theme";
}> | Readonly<{
    source: "profile";
    profile: DynamicColorProfile;
    blendRatio?: number;
}> | Readonly<{
    source: "context";
    key: string;
    blendRatio?: number;
}> | Readonly<{
    source: "manual";
    color: number;
}>;
export declare const assertEmbedColor: (value: number, label?: string) => number;
export declare const blendEmbedColors: (base: number, overlay: number, overlayRatio: number) => number;
export declare const rgbToEmbedColor: (color: RgbColor) => number;
export declare const embedColorToRgb: (color: number) => RgbColor;
export declare const deriveDynamicColorProfile: (samples: readonly (readonly number[])[], options?: DeriveDynamicColorOptions) => DynamicColorProfile;
export declare const resolveDynamicColor: (themeColor: number, context: Readonly<Record<string, DynamicColorSource>>, policy?: DynamicColorPolicy) => number;
export declare const dynamicColorPolicy: (profile: DynamicColorProfile | null, blendRatio?: number) => DynamicColorPolicy;
//# sourceMappingURL=colors.d.ts.map