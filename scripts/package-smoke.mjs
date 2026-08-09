import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = mkdtempSync(join(tmpdir(), "dynamic-embed-engine-smoke-"));
const excluded = new Set([".git", "node_modules"]);
const probe = `
  import * as engine from "@anto-project/dynamic-embed-engine";
  const { EmbedPlanBuilder, deriveDynamicColorProfile, validateEmbedPlan } = engine;
  const profile = deriveDynamicColorProfile([[12, 34, 56]]);
  const plan = EmbedPlanBuilder.info().dynamicColor({}, { source: "profile", profile, blendRatio: 0 }).description("ok").build();
  if (plan.color !== profile.averageColor) process.exit(10);
  if (plan.locale !== "und") process.exit(11);
  if (validateEmbedPlan({ ...plan }).description !== "ok") process.exit(12);
  if ("formatEmbedMarkup" in engine || "escapeUntrustedEmbedText" in engine) process.exit(13);
`;

const installAndProbe = (name, target) => {
  const consumer = join(temporaryRoot, name);
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", target],
    { cwd: consumer, stdio: "pipe" },
  );
  execFileSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: consumer,
    stdio: "pipe",
  });
};

try {
  const cleanSource = join(temporaryRoot, "clean-source");
  cpSync(projectRoot, cleanSource, {
    recursive: true,
    filter: (source) => !excluded.has(relative(projectRoot, source).split(sep)[0]),
  });
  if (!readFileSync(join(cleanSource, "dist", "index.js"), "utf8").includes("export")) {
    throw new Error("A clean source checkout must contain its prebuilt entry point.");
  }
  installAndProbe("source-consumer", cleanSource);

  const packed = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--silent", "--pack-destination", temporaryRoot], {
      cwd: projectRoot,
      encoding: "utf8",
    }),
  );
  const result = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  if (result === undefined || typeof result.filename !== "string") {
    throw new Error("npm pack did not return a package filename.");
  }
  const paths = new Set(result.files.map((entry) => entry.path));
  for (const required of ["dist/index.js", "dist/index.d.ts", "README.md"]) {
    if (!paths.has(required)) throw new Error(`Packed artifact is missing ${required}.`);
  }
  for (const forbidden of ["dist/markup.js", "dist/markup.d.ts", "src/markup.ts"]) {
    if (paths.has(forbidden)) throw new Error(`Packed artifact contains provider markup: ${forbidden}.`);
  }
  installAndProbe("tarball-consumer", join(temporaryRoot, result.filename));

  const manifest = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  if (manifest.name !== "@anto-project/dynamic-embed-engine") {
    throw new Error("Package name is not canonical.");
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
