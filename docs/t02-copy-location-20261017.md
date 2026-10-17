# Role 2: copy current public location link

Before PR scope: owner2, OleksandrKiris/citronex-hydra-project.
Base b820e85fe44cbc0c36a0d86ecdcc1e95f131431b; full parent tree
bc553c2f16fff079e866f7e60f82e3969a90b5f5. Open PRs empty; Pages39059220706
success. Search clipboard/share/copy found no existing copy action. Arrival's
v=share-check-2 URL is an existing route parameter, not a copy UI implementation.
Branch codex/hydra-copy-location-20261017; only index.html, sw.js,
tests/navigation.test.mjs, tests/browser.mjs, this journal.
No workflows/dependencies/other repositories/media/contact/material edits.

Scenario: choose a confirmed location, use Copy location link, receive success
or a selectable readonly public URL with manual-copy message. Link is rebuilt
from existing allowlisted route and current effective language; no current-page
query/hash, person record, learning progress or external URL from storage enters it.
Only explicit button activation calls Clipboard API. Nothing is sent to another person.
Language/location/clear changes invalidate late clipboard status. The URL field
updates on language change; clearing removes the in-memory share URL and status.
No extra storage key; existing public ID and language conventions preserved.

| Area | Implementation / evidence |
| --- | --- |
| Accepted clipboard boundary | Success message; keyboard focus retained on copy action |
| Rejected/unavailable clipboard | Labelled readonly URL, focused and fully selected; manual-copy message |
| Current language | Existing route fallback; no invented translated procedures |
| Invalid ID | Empty URL/hidden share area; no copy call |
| Reload/Back/storage denial | Prior semantics retained, no unconditional persistence promise |
| Old service worker | Upgrade from actual b820 main; exact new cached shell and original offline/load gate |
| QA | 99 local unit/negative PASS; exact-head CI pending, 54 old +12 new browser cases |

Clipboard success/rejection/unavailability in CI are injected API-boundary outcomes,
not a claim of OS-clipboard permissions on every device. 320px is emulated.
Native-speaker/physical-phone checks remain limits. External training/audio is
blocked; offline means installed hub shell, not external training availability.
Previous offline-upgrade timeout root cause is not declared fixed.

Mandatory tree guard after prior PR12 incident: require concrete verified full
parent tree in every create_tree; compare returned tree with locally built complete
tree and full net path set BEFORE create/update branch ref. Never publish a partial
root tree. Exact base/head/CI/artifact and guard evidence go in the PR journal.
Function prepared; no new API/schema/online adapter. Acceptance/publication pending
role10; owner2 does not merge/deploy or change schedules.
