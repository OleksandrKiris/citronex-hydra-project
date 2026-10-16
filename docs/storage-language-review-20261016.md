# HYDRA language reliability — 16 October 2026

Confirmed failure: the original inline script directly reads `localStorage` before initializing the language UI. A browser SecurityError stops initialization, leaving training links and translations uninitialized. Direct writes also interrupt language changes and closing the introduction when storage is blocked or full.

Use small guarded read/write helpers. URL language stays authoritative; the selected language, section and hash remain in the URL when storage cannot persist a preference. All original translations, audio, contacts, city targets and supported language mappings are unchanged. Service worker cache advances to `20261016-storage1` so the HTML shell is refreshed.

Verification: original source reproduces SecurityError in the Node VM; revised source passes all 36 tests (25 service-worker + 11 language/navigation cases). Nine languages, uk→ua training / ua→uk catalog, explicit unsupported-language English fallback, saved/browser language priority, blocked storage, normal persistence and closing the introduction are covered. No operational requests or audio playback are performed. CI runs both suites and now observes index/navigation-test changes.

No browser/mobile visual test is claimed. Revert the PR including sw.js for rollback. No new resources, tracking or integrations.
