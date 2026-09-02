# Roster

Live list of lanes and sessions. The Foreman updates this on every spawn and archive.

| Lane | Status | Session | Current ticket | Since |
|---|---|---|---|---|
| foreman | active | session_01Xrs89tChgyyjHaJHna165K | Phase 0 coordination, #1 Digest | 2026-09-01 |
| infra | done | session_01BSCXiAt9Md5S9ZZ7XVPzrS | #2 scaffold, merged as PR #14 | 2026-09-02 |
| infra | done | session_01TucUaDccCZcfrg6nP5CFwi | #12 Garage deploy, merged as PR #16 | 2026-09-02 |
| infra | done | session_01U1wsPcoZiaZFC5SNtUPTEH | #11 CI guards, merged as PR #17 | 2026-09-02 |
| art | done | session_01UaKpw34TT6nFFfXec6EGCK | #3 pipeline move, merged as PR #13 (Verifier session_01QqVLgxYDm8TMg51Nh5kiTU approved) | 2026-09-02 |
| world | done | session_016yv8aPqYXfRfWNuFCyBiQS | #10 farm content, merged as PR #15 | 2026-09-02 |
| sim | done | session_01RNhjEJp3aB7MZj9NRYpDeh | #4 clock, RNG, step, merged as PR #18 (Verifier session_01ChUNxEUTH453EE89FtFTGn approved) | 2026-09-02 |
| sim | done | session_01Y8mRE88YxpXSCaE4dv8foL | #5 part a: registry and DL chain, merged as PR #23 after the owner's pin (fix workers session_01NV8mL9L7nchRpJ1N8ySjBZ and session_01Ki5ZREZCkJ6eqBHBqsaaSt) | 2026-09-02 |
| sim | done | session_01UHyCUx8NRHHoBXzGVTHEiq | #5 part b: sheep, lambs, NPCs, merged as PR #26 after the owner's pin (Verifier session_012nbMWpRbm7RxGEB1oM1EQU; merge worker session_01HdMizhyRarxe8Wxa6jWBQS) | 2026-09-02 |
| sim | in review | session_018purx56Sqfu5RbqPFvLyoQ | #25 player intents, PR #30 open, Verifier spawned | 2026-09-02 |
| sim | active | session_01Y9Qsy4i5yNo4fZUJZCJALL | #27 registry hot path and bench bar | 2026-09-02 |
| sim | done | session_01QRszNSGVx7TZV97ud6uZwn | #8 save v1, merged as PR #22 (Verifier session_01MKos2vVS14sLaH3N4dWKoD approved) | 2026-09-02 |
| client | done | session_01BzngZosAW3AvFAP4XMhC1A | #6 renderer port, merged as PR #19 (Verifier session_013uNxpKjNWXAVSXaAJs7zDr; Foreman resolved a spec-name collision with #21) | 2026-09-02 |
| client | done | session_01M7oHrnRiqrvqwGM7aWZ1JP | #7 input and pin overlay, merged as PR #24 after the owner's pin (Verifier session_01BAsYfT1x8aae9UpDr3NYvn; nits worker session_01Q7HsUjbWsdCM89DZwhrbqN; Foreman raised the JS budget) | 2026-09-02 |
| qa | done | session_01XwNiAQpm1ectYv8dsxiMWX | #9 watch test and goldens, merged as PR #21 | 2026-09-02 |
| client | active | session_01NFdtsZpVraCTq3LGBUmLoQ | #28 real sim in the app at parity (Phase 0 exit gate, owner pin) | 2026-09-02 |
| infra | active | session_0139MAKFzvgv1t7v38D7yX5H | #29 second tile sheep-city-next | 2026-09-02 |
| economy | not started | — | Phase 2 | — |

Budget tier: Standard (about four lanes), set 2026-09-02.

## Phase 0 ticket order
#2 scaffold (landed) → #4 clock/RNG (landed) → #5 behaviour registry (both parts landed) and #8 save v1 (landed)
#2 scaffold (landed) → #6 renderer (landed) → #7 input and pin overlay (landed); #9 watch test (landed)
#3 art pipeline (landed) → #11 palette and ownership checks (landed; CI now enforces lane paths)
#10 farm content (landed)
#12 Garage deploy from GitHub Actions (landed; LIVE at https://sheep-city.sheepcliff.com serving the v31 prototype until the owner pins the port)
#25 sim player intents (active) and #27 sim perf (active), both after #5

## Phase 0 exit
All ten tickets landed 2026-09-02. Exit gate: #28 client runs the real sim at parity (owner pin) on the second tile from #29; then the sheep-city tile swaps from the prototype to the app.

## Health note 2026-09-02 19:05 UTC
Every worker session reports the account's five-hour usage window as exhausted (rate limit status rejected, overage on, resets 20:20 UTC). Workers #27, #28, #29 may stall until then. No action in the repo; the owner decides whether to raise the plan's limit.
