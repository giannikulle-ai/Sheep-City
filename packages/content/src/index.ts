// @sheepcliff/content — data files (creatures, buildings, districts, events, balance, names).
// This file is a scaffold placeholder; the world lane replaces it with JSON plus schemas.

export const CONTENT_PACKAGE = '@sheepcliff/content';

/** District ids the plan names. Data for each arrives in later tickets. */
export const DISTRICT_IDS = ['farm', 'village-green', 'cliff-harbour', 'wildwood'] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];
