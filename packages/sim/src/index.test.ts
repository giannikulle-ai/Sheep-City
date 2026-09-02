import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, SIM_PACKAGE } from './index';

describe('@sheepcliff/sim placeholder', () => {
  it('exports a save version and package name', () => {
    expect(SAVE_VERSION).toBe(0);
    expect(SIM_PACKAGE).toBe('@sheepcliff/sim');
  });
});
