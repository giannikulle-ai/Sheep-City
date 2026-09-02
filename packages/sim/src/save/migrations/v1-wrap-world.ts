// v0 -> v1: the clock ticket's bare state becomes the world inside a versioned envelope.
// Nothing inside the state changes shape; the migration moves `version` out and adds `format`.

import { SAVE_FORMAT } from '../doc';
import type { Migration } from './index';

export const v1WrapWorld: Migration = {
  from: 0,
  title: 'v0 to v1: wrap the bare state in a { format, version, world } envelope',
  up(doc) {
    const { version: _version, ...world } = doc;
    return { format: SAVE_FORMAT, version: 1, world };
  },
};
