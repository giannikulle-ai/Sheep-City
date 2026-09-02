// The clock values behind the tray's "jump to" verbs, and the values the app's golden
// screenshots capture (#20). Each is the midpoint of its phase, well outside the renderer's
// crossfade band (`phaseMix` blends within 0.025 of the edges at 0, .42, .52 and .92), so a
// jump lands on one clean background rather than a mix of two, and what the owner sees on
// "jump to dawn" is exactly the picture the golden checks. The prototype's own jumps (dawn
// .94, dusk .44) sat inside the band and showed about 60% of the previous phase.
//
// No imports, on purpose: the e2e specs share this module without pulling the sim in.
export const JUMP_T = { dawn: 0.96, noon: 0.21, dusk: 0.47, night: 0.72 } as const;

export type JumpPhase = keyof typeof JUMP_T;
