# Role 2 — HYDRA native entry WIP, 2026-10-17

Owner: 2. Repository: OleksandrKiris/citronex-hydra-project.
Allowed paths: index.html, sw.js, tests/navigation.test.mjs, tests/browser.mjs,
docs/t02-native-entry-20261017.md. Dependencies: existing service-worker CI;
release/merge owner 10. Workflows, dependencies and external products untouched.
Base: 02a1bfdb08b1ccf72e49113f57ca144ab14cd328 (accepted PR10).
Continues unbound WIP 938214096137db5acb19607fcf33d162ec0158ae in the
existing primserv/t02/hydra-ka-tr-hy-20261017 branch; no duplicate PR10.
Fresh open PR search: empty. Remote WIP head equals base. No competing role-2
run was found in available history/branches; cross-session activity is not fully observable.

## Scenario and evidence

| Area | State | Evidence / next step |
| --- | --- | --- |
| Existing languages, IDs and location routes | Unit verified | Same existing targets; no media or progress keys removed |
| Georgian, Turkish, Armenian hub | Prepared | Native labels and text guide; no invented audio |
| External training handoff | Prepared | Explicit notice and English target; HYDRA preference retained |
| Ukrainian mapping | Preserved | ua legacy route; uk document/catalog language |
| Denied storage/history, corrupt preference, URL context | Unit verified | navigation.test.mjs |
| Original WIP tests | Broken then corrected | Two Turkish assertions incorrectly expected English document language |
| Back/reload, keyboard, 320px, worker upgrade and offline | Pending exact-head CI | tests/browser.mjs; CI-only runner, not executed locally |
| Translation quality | Review gap | Native-speaker confirmation pending |

87 unit/negative tests passed after correcting only those two expectations.
Original WIP: 85 passed, 2 failed. Syntax checks passed for inline JavaScript,
sw.js and tests/browser.mjs. Existing CI runner is not impersonated locally.
Offline means installed HYDRA shell; external training and uncached audio need network.
No server, online adapter, AI call, candidate data or real submission added.

Function: prepared, unit verified; UI/offline acceptance pending.
Contract: no new API/schema or integration contract; URL/storage conventions preserved.
Acceptance/publication: not accepted, not merged, not deployed.
Fresh CI evidence: Pages 39035254461 success on base; PR10 CI 39018008178
success on its pre-merge head 0c0db6f8a9af9985cc8c7cfb3e2ff34706f32e56.
Neither run proves this WIP. Next: exact-head CI, review, release decision by 10.

CI 39045212681 on b2ed637: unit/syntax passed; browser found missing audio-status
on reopening native text guide (browser.mjs:81). revealIntroText now restores the
explicit no-audio explanation. Follow-up exact-head CI required; assertions retained.
