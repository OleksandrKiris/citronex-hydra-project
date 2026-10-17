# HYDRA: language survives History API denial

Base: e3524efc5b9586a53790707381d671786149e3f0. Owner 2; release owner 10.
Continuation of the earlier local 4527681 report; that object was not found in
available worktrees/remote, so the same narrow fix was recreated on verified main.
Issues are disabled in this repository (410); the PR is the issue/acceptance record.

`setLang` used to throw before translation, location URLs and audio-source update
if reading history.state or calling replaceState was denied. Eleven new regression
tests fail on the old source and pass after the guarded call (73 total tests).
No reload/navigation fallback, new storage or network calls. Existing URL state is
preserved; when URL writes are denied, its explicit language wins again on reload.
This limitation is intentional, not a promise that the URL changed.

CI 39014161902 reproduced another part of the same history-denial scenario:
Back restored the select's previous Ukrainian value without firing change,
while the explicit unsupported URL had already initialized English text/routes.
The language select now disables native form-value autocomplete/restoration;
the existing URL/preference initialization remains its single state owner.
The browser regression retains its strict select/text/route language assertions
and also checks the restored section/hash and explicit fallback explanation.

Runtime: index.html + guarded history call and select restoration; sw.js cache
20261017-history2. Relative to the previous PR head, HTML grows by 19 bytes.
All content, translations, audio and routes are unchanged. Six core cache entries
remain six. No extra runtime requests, dependencies or media preloading.

Run: download this commit; `python3 -m http.server 8080 --bind 127.0.0.1`, then
open localhost:8080 (Ctrl+C to stop). This is a documented local HTTP method, not
a claim of a tested file:// service worker. First load/download needs a network;
the installed hub shell can work offline, external training/contact pages and
uncached audio still require a network. No form queue or personal-data storage.

Checks: `node --test tests/sw.test.mjs tests/navigation.test.mjs`; no package.json
or npm test exists. CI-only tests/browser.mjs exercises exact-head Chromium:
1280/320, keyboard, nine languages, ka fallback, routes, reload/Back, real offline,
injected history/storage failures, corrupt storage, and old-worker upgrade with
preserved preferences. Reports/screenshots/traces are CI artifacts, not Pages.
Do not run a standalone local browser as a preview workaround. Until this exact
matrix is run and reviewed, keep the PR draft; unit tests are not browser proof.
320px is not a physical phone. External sites/audio playback are excluded.

Rollback: separate reviewed revert PR of this change, with a fresh cache suffix;
keep later unrelated commits and preferences. Never reset/force-push. No merge,
main write or deploy by owner 2. Exact tested head/results belong in the PR journal.

