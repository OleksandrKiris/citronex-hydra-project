# Role 2: return to last selected public location

Owner/repository: 2, OleksandrKiris/citronex-hydra-project.
Base: 0aaa156939e35d52506629d509abb3e5271d27e9 (accepted PR11).
Scope: index.html, sw.js, tests/navigation.test.mjs, tests/browser.mjs,
docs/t02-last-location-20261017.md. Branch: codex/hydra-last-location-20261017.
No open PR or equivalent last-location feature found at start. Existing hub stored
language only; three confirmed training-link IDs/routes provide the allowlist.
No workflow, dependency, contact, training procedure, media or other repository edits.

| Area | State | Evidence / next gate |
| --- | --- | --- |
| Pick a site and return quickly | Prepared | Existing source-link keyboard/click saves only its public element ID |
| Current language | Prepared | Resume href copies freshly rebuilt allowlisted source route; ka/tr/hy use existing English training fallback |
| Clear choice | Prepared | Visible button removes key, clears memory, focuses language control |
| Unknown/corrupt ID | Unit verified | Hidden panel, absent href; external URL cannot be used as stored route |
| Denied storage/history | Unit verified | Normal routes work; memory-only selection, no reload persistence guarantee |
| Keyboard/320/language/reload/Back/offline | CI pending | Targeted browser cases plus existing accepted matrix |
| Upgrade from previous main | CI pending | Real old-worker install, new cache, original language/unrelated preference preservation |

Storage: hydraLastLocationV1 contains only one of siechniceTraining,
ryczywolTraining, zgorzelecBogatyniaTraining. No URL or personal record.
If removal is denied, the visible state is cleared in memory; an unreadable store
cannot provide a location after reload. No claim of durable clear when the browser
refuses writes/removal. Existing language-denial fallback remains unchanged.
The feature remembers a chosen destination, not learning progress/completion.
Offline covers installed hub shell; external training may need network.

95 unit/negative tests pass locally; browser runner remains CI-only. Exact head,
CI/artifact and acceptance outcome will be recorded in the PR journal.
Function: prepared. Contract: no new API; existing IDs/routes reused.
Acceptance/publication: pending role10; no merge/deploy by role2.
Native-speaker and physical-phone verification remain evidence limits.

## P2 review correction

Independent review of 9e2c261 found the new panel inherited the 44px icon
column from .card. The old 1280 PNG shows vertical heading/clear labels.
Original CI12110755235 PNG bytes are preserved in docs/evidence/before-9e2c261-*.
The return panel now has its own one-column layout, without .card inheritance.
Browser assertions measure heading and clear width, text line count, horizontal
overflow and total panel height in all 12 UI languages at 1280/320 across the
existing fault matrix. All 54 scenarios and offline/load assertions are retained.
New exact-head CI/artifact belongs in PR12; old green was not acceptance proof.
