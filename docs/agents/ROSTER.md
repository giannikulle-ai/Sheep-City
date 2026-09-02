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
| sim | in review | session_01UHyCUx8NRHHoBXzGVTHEiq | #5 part b: sheep, lambs, NPCs, PR #26; Verifier session_012nbMWpRbm7RxGEB1oM1EQU approved, owner pinned okay; worker session_01... merging base with save v3 | 2026-09-02 |
| sim | done | session_01QRszNSGVx7TZV97ud6uZwn | #8 save v1, merged as PR #22 (Verifier session_01MKos2vVS14sLaH3N4dWKoD approved) | 2026-09-02 |
| client | done | session_01BzngZosAW3AvFAP4XMhC1A | #6 renderer port, merged as PR #19 (Verifier session_013uNxpKjNWXAVSXaAJs7zDr; Foreman resolved a spec-name collision with #21) | 2026-09-02 |
| client | in review | session_01M7oHrnRiqrvqwGM7aWZ1JP | #7 input and pin overlay, PR #24; Verifier approved, owner pinned okay; fix worker session_01Q7HsUjbWsdCM89DZwhrbqN applying three nits, then merge | 2026-09-02 |
| qa | done | session_01XwNiAQpm1ectYv8dsxiMWX | #9 watch test and goldens, merged as PR #21 | 2026-09-02 |
| economy | not started | — | Phase 2 | — |

Budget tier: Standard (about four lanes), set 2026-09-02.

## Phase 0 ticket order
#2 scaffold (landed) → #4 clock/RNG (landed) → #5 behaviour registry (part a active, part b next) and #8 save v1 (landed)
#2 scaffold (landed) → #6 renderer (landed) → #7 input and pin overlay (active); #9 watch test (landed)
#3 art pipeline (landed) → #11 palette and ownership checks (landed; CI now enforces lane paths)
#10 farm content (landed)
#12 Garage deploy from GitHub Actions (landed; LIVE at https://sheep-city.sheepcliff.com serving the v31 prototype until the owner pins the port)
#25 sim player intents (queued; starts after #23 and #26 merge)
