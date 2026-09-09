// The chronicle: the whole world's log (plan, section 2, "The chronicle and the storybook"). Any
// system writes to it through `tell` (store.ts); nothing it appends is ever edited or dropped.

export { FARM_DISTRICT, CHRONICLE_SOURCES, type ChronicleSource, type FactValue, type ChronicleEntry, type TellInput } from './types';
export { NOTABILITY_WINDOW, notabilityScale, deviationNotability, noteFact, createChronicleStats, cloneChronicleStats, type FactStat, type ChronicleStats } from './notability';
export { createChronicle, cloneChronicle, tell, chronicleBetween, type Chronicle } from './store';
export { tellLedgerDiff } from './ledger-diff';
export {
  STORYBOOK_PLACEHOLDERS,
  STORYBOOK_SUBSTITUTIONS,
  coinsMoved,
  fillStorybookLine,
  type StorybookFacts,
  type StorybookPlaceholder,
} from './storybook-line';
