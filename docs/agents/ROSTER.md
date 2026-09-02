# Roster

Live list of lanes and sessions. The Foreman updates this on every spawn and archive.

| Lane | Status | Session | Current ticket | Since |
|---|---|---|---|---|
| foreman | active | session_01Xrs89tChgyyjHaJHna165K | Phase 0 coordination, #1 Digest | 2026-09-01 |
| infra | active | session_01BSCXiAt9Md5S9ZZ7XVPzrS | #2 repo scaffold | 2026-09-02 |
| art | active | session_01UaKpw34TT6nFFfXec6EGCK | #3 pipeline move | 2026-09-02 |
| world | active | session_016yv8aPqYXfRfWNuFCyBiQS | #10 farm content | 2026-09-02 |
| sim | queued | — | #4 clock and RNG, after #2 lands | — |
| client | queued | — | #6 renderer port, after #2 lands | — |
| qa | queued | — | #9 watch test, after #6 | — |
| economy | not started | — | Phase 2 | — |

Budget tier: Standard (about four lanes), set 2026-09-02.

## Phase 0 ticket order
#2 scaffold → #4 clock/RNG → #5 behaviour registry (two PRs) → #8 save v1
#2 scaffold → #6 renderer → #7 input and pin overlay → #9 watch test
#3 art pipeline (independent) → #11 palette and ownership checks (after #2 and #3)
#10 farm content (independent)

Blocked: real deploy to The Garage until lab.sheepcliff.com is on the environment allowlist (#2 ships the deploy script only).
