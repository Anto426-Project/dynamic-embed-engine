# ADR-0001: Provider-neutral dynamic embed engine

Status: accepted

## Decision

Dynamic palette derivation and rich presentation validation form an
independent technical category. They live in this repository instead of a
product bot or provider adapter.

The engine accepts already extracted RGB samples and emits immutable plans.
It never fetches images, reads secrets, selects recipients, formats provider
markup or renders product templates. Those concerns remain in the consuming
adapter/domain. URLs in plans are always credential-free HTTPS; adapters that
dereference them retain DNS/IP, redirect, size and timeout responsibility.

The canonical plan uses locale `und` and a non-branded fallback palette.
Products inject locale and branding. Provider adapters revalidate structural
input with their own exact-host policy and may impose tighter payload limits.

## Consequences

- Antobot and UniBot can share the visual engine without sharing handlers or
  credentials;
- non-Discord projects can encode the same plan for another provider;
- image loading and provider payload encoding remain separately sandboxed;
- Markdown/mention/HTML escaping stays provider-owned;
- product-specific branding and translated message catalogs stay outside;
- built output is tracked so pinned submodule/file consumers need no install
  lifecycle script.
