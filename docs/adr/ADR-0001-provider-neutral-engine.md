# ADR-0001: Provider-neutral dynamic embed engine

Status: accepted

## Decision

Dynamic palette derivation and rich presentation validation form an
independent technical category. They live in this repository instead of a
product bot or provider adapter.

The engine accepts already extracted RGB samples and emits immutable plans.
It never fetches images, reads secrets, selects recipients or renders product
templates. Those concerns remain in the consuming adapter/domain.

## Consequences

- Antobot and UniBot can share the visual engine without sharing handlers or
  credentials;
- non-Discord projects can encode the same plan for another provider;
- image loading and provider payload encoding remain separately sandboxed;
- product-specific branding and translated message catalogs stay outside.
