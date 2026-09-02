// @sheepcliff/sim — pure TypeScript simulation core.
// No DOM, no timers, no Math.random. See docs/SHEEPCLIFF_PLAN.md section 5.

export const SIM_PACKAGE = '@sheepcliff/sim';

export { RULES, TICK_MS, TICK_SEC, type Rules } from './rules';
export { createRng, cloneRng, nextU32, nextFloat, nextRange, nextInt, chance, pick, type Rng } from './rng';
export {
  W,
  H,
  C,
  RX,
  RY,
  BARN,
  SPOT,
  POSTS,
  FLOWERS,
  SHEEP_SIZE,
  LUNA_SIZE,
  NPC_SIZE,
  SFOOT,
  LFOOT,
  inBarn,
  insideField,
  randomFoot,
  randomDir,
  type Point,
} from './geometry';
export {
  SEASONS,
  SEASON_TEMP,
  SEASON_ODDS,
  SEASON_MS,
  createClock,
  createSeason,
  phaseOf,
  advanceClock,
  advanceSeason,
  seasonAt,
  currentSeason,
  type Clock,
  type Phase,
  type Season,
  type SeasonName,
} from './clock';
export { createWeather, setWeather, tickWeather, type Weather, type WeatherKind, type WeatherMode } from './weather';
export {
  SAVE_VERSION,
  NAMES,
  COLORS,
  createInitialState,
  cloneState,
  makeTufts,
  makeSheep,
  makeLuna,
  sheepFoot,
  lunaFoot,
  type SimState,
  type InitialStateOptions,
  type ActorId,
  type Dir,
  type Tuft,
  type Lamb,
  type Sheep,
  type Luna,
  type StickThrow,
  type Npc,
  type NpcJob,
  type Npcs,
  type Banks,
  type Life,
  type Rabbit,
  type Bird,
  type Butterfly,
  type Fly,
  type Stamper,
  type SnowPrint,
  type MudPatch,
  type Ground,
} from './state';
export {
  applyIntent,
  applyDueIntents,
  INTENT_TYPES,
  LUNA_ACTIONS,
  FARM_ACTIONS,
  SHEEP_ACTIONS,
  type Intent,
  type IntentType,
  type LunaAction,
  type FarmAction,
  type SheepAction,
  type SheepTarget,
  type PetTarget,
} from './intents';
export { createRegistry, DEFAULT_CHAIN, type Behaviour, type Registry } from './behaviours/registry';
export {
  LUNA_BEHAVIOURS,
  IDLE_PLAYS,
  tickLuna,
  lunaContext,
  walkLuna,
  dismount,
  leaveBarn,
  petLuna,
  type LunaContext,
  type LunaBehaviour,
} from './behaviours/luna';
export {
  SHEEP_BEHAVIOURS,
  NEEDS,
  tickSheep,
  sheepContext,
  setPath,
  nextLeg,
  flockCount,
  newLamb,
  type SheepContext,
  type SheepBehaviour,
} from './behaviours/sheep';
export { NPC_FOOT, makeNpc, summonFarmer, summonMerchant, npcStep, tickNpcs, buyUpgrades, type JobHook, type JobResult } from './npcs';
export { stepToward, clampField, clampTarget, clampMoverTarget, segHitsBarn, waypointAround, type Mover } from './movement';
export { LUNA_ID, findSheep, bubble, nearestTuft } from './actors';
export { tickRabbit, tickButterflies, tickBird, landBird } from './life';
export { groundSnowy, stampGround, tickGround, PRINT_CAP, MUD_CAP, MELT_MUD_CAP, STAMP_EVERY_PX, MUD_FADE_MS, MUD_FADE_RAIN_MS } from './ground';
export { tick, tickInPlace, advance } from './tick';
export { step, type StepOptions } from './step';
export { hashState, hashValue, canonicalJson, fnv1a, mix32 } from './hash';
export { SAVE_FORMAT, SaveError, type SaveDoc, type SaveWorld, type SaveErrorCode, type UnknownSaveDoc } from './save/doc';
export { toSave, fromSave, toSaveText, fromSaveText, validateWorld, findUnserializable } from './save/serialize';
export { MIGRATIONS, migrateSave, assertMigrationChain, readVersion, type Migration } from './save/migrations/index';
