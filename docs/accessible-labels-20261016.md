# Localized navigation labels — 16 October 2026

Base: `58509b51bb302907c5b5ed838f90e77fca4b528b`.

Confirmed defects: the language select's hardcoded Polish aria-label overrode its translated label; the card region also kept a Polish accessible name. All three training links exposed the same action without identifying their destination city in a screen-reader link list.

The select and card region now reference their existing translated labels with aria-labelledby. Each training link combines its existing translated action with the unchanged city heading. The link's own ID retains its visible action in the concatenated name, following [W3C ARIA9](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA9). No extra translations, visual text, destinations or operational facts were introduced.

Validation: 55 Node tests, including 18 language/city cases that failed before the fix and one label-reference integrity check. Tests now read label attributes/text from the actual HTML before exercising real language initialization and changes. Unique valid IDs, all nine languages, distinct city names, correct URLs, Ukrainian code mapping, preserved context, blocked storage and offline caching are covered. JavaScript syntax and complete diff checked. No package.json/npm test exists.

All original inline JavaScript, CSS, visible text, audio, official logos, contacts and links remain unchanged. Cache: `20261016-labels1`. No new dependency or network request. Browser connection remains unavailable; these are code/DOM and HTTP checks, not a real visual, mobile or screen-reader audit. No messages, applications, calls or bookings were sent.

Rollback: revert this PR, advance the cache version and repeat the checks before publishing.
