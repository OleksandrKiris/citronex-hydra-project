# Explicit unsupported-language notice — 2026-10-16

Base: `86e8cd4c0af95ef11517b065e639fbc90223d4d9` (main, no open PRs when checked).

## Confirmed issue

An explicit `?lang=ka` or other unsupported language correctly selected English,
but silently rewrote the URL to `lang=en`. Nothing explained the missing
translation. This was inconsistent with the guide's existing Georgian/Armenian
fallback indication and the requirement for an honest English fallback.

## Small fix

- Show a visible English status notice immediately below the language selector
  for an explicitly requested unsupported language. Georgian and Armenian use the
  same native language names already used in the guide, not invented translations.
- The existing English fallback and routes are unchanged. A subsequent manual
  language choice dismisses the notice; it does not reappear on switching back.
- All nine supported languages, the `uk` alias, and ordinary stored/browser
  preference selection retain their existing behavior without a new notice.
- Unknown URL values are never echoed into the page; only fixed text is assigned
  via `textContent`. The notice has `role="status"`, `lang="en"`, and is hidden
  in static markup. Its fluid wrapping uses the existing PrimServ colors.
- Cache namespace advanced from `20261016-labels1` to `20261016-fallback1`.

## Checks

- All seven new regression tests failed against the unmodified HTML first.
- `node --test tests/sw.test.mjs tests/navigation.test.mjs`: 62 passed.
- `node --check sw.js`, inline script compilation, and `git diff --check`: pass.
- Parsed comparison: existing anchor/image/audio/source/option attributes and all
  translation dictionaries are unchanged. No original content or media removed.
- No package.json or npm test script exists; no dependencies added.
- Regression coverage includes `ka`, `KA`, `hy`, arbitrary unsupported URL values,
  blocked storage, preserved section/hash, the three city routes, arrival/catalog
  links, Ukrainian mapping, and dismissal through the actual change handler.

## Limits and rollback

Tests execute the actual initialization and handlers with a DOM mock; they are
not a rendered browser, phone, or screen-reader test. Connected browser access
failed (originating-context error), and the permitted fallback timed out. Manual
visual and assistive-technology checks remain outstanding.

No bot, HRappka, instruction, contact, photo or audio changes. Roll back this PR
through a new revert PR and advance the cache namespace again when publishing.
