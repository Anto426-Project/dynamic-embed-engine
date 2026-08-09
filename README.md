# `@anto-project/dynamic-embed-engine`

Provider-neutral engine for immutable rich-card plans and dynamic color
profiles. Discord bots, admin tools and future presentation adapters can reuse
the same bounded data model without importing a product or provider SDK.

The engine is pure: no network, filesystem, image decoder, provider SDK,
credentials, environment access, product catalog or business policy. Callers
extract RGB samples and supply them to the engine; provider adapters encode and
escape the resulting plan for Discord, HTML, email or another channel.

Owned primitives:

- bounded card plans, immutable builder and closed structural revalidation;
- semantic themes with an injectable, product-owned color palette;
- validated RGB conversion, blending and order-independent dynamic palettes;
- dynamic/context/manual color policies;
- credential-free HTTPS URLs with optional exact-host allowlists;
- canonical text/field limits that adapters may narrow for their provider.

Provider markup is deliberately outside this package. Markdown formatting,
mention suppression, HTML escaping and final provider payload encoding belong
to the consuming adapter. Image download is also outside: an adapter that
fetches artwork must enforce DNS/IP and redirect SSRF policy, response size,
content type and timeout before passing extracted RGB samples here.

## Usage

```ts
import {
  EmbedPlanBuilder,
  deriveDynamicColorProfile,
  validateEmbedPlan,
} from "@anto-project/dynamic-embed-engine";

const profile = deriveDynamicColorProfile([[12, 34, 56], [210, 120, 20]]);
const plan = EmbedPlanBuilder.info({
  locale: "en",
  urlPolicy: { allowedHosts: ["cdn.example.test"] },
})
  .dynamicColor({}, { source: "profile", profile })
  .image("https://cdn.example.test/card.png")
  .description("Ready")
  .build();

const safeForAdapter = validateEmbedPlan(
  { ...plan },
  { urlPolicy: { allowedHosts: ["cdn.example.test"] } },
);
```

The default locale is `und` (undetermined). Products must choose their locale
and inject branded theme colors explicitly. URLs are always HTTPS; a caller
cannot enable another scheme through policy.

## Submodule/file consumption

The repository tracks `dist/`, so a clean pinned checkout can be consumed as a
local dependency without executing dependency lifecycle scripts:

```json
{
  "dependencies": {
    "@anto-project/dynamic-embed-engine": "file:vendor/dynamic-embed-engine"
  }
}
```

After changing `src/`, run the complete check so the tracked build output stays
in sync.

## Commands

```bash
npm ci
npm run ci
```
