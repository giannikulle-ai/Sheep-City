import { describe, expect, it } from 'vitest';
import { CONTENT_PACKAGE, DISTRICT_IDS } from './index';

describe('@sheepcliff/content placeholder', () => {
  it('lists the four planned districts with the farm first', () => {
    expect(CONTENT_PACKAGE).toBe('@sheepcliff/content');
    expect(DISTRICT_IDS).toHaveLength(4);
    expect(DISTRICT_IDS[0]).toBe('farm');
  });
});
