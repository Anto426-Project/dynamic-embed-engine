# `@anto-project/dynamic-embed-engine`

Provider-neutral engine for immutable rich-card/embed plans and dynamic color
profiles. It is extracted as its own repository so Discord bots, admin tools
and future presentation adapters can reuse the same validation and color
semantics without importing Antobot.

The engine is pure: no network, filesystem, image decoder, provider SDK,
credentials, environment access, product catalog or business policy. Callers
extract RGB samples and supply them to the engine; provider adapters encode
the resulting plan for Discord, HTML, email or another channel.

Owned primitives:

- bounded embed/card plans and immutable builder;
- semantic themes with an injectable color palette;
- RGB/HSL conversion, blending and deterministic dynamic palettes;
- dynamic/entity/manual color policies;
- HTTPS URL policy and total text validation;
- safe untrusted text escaping and a bounded authoring-markup formatter.

## Commands

```bash
npm ci
npm run ci
```
