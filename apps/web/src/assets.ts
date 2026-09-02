// Where the built art lives. This is the ONE place that knows the path: when the
// art pipeline PR moves the build to tools/art/build, change the glob below.
// Vite needs the pattern as a literal, so the constant is the glob call itself.
import type { BackgroundKey } from '@sheepcliff/render';
import { BACKGROUND_KEYS } from '@sheepcliff/render';

const ART_BUILD = import.meta.glob(
  ['../../../prototype/luna-farm/build/*.{png,json}', '!**/spritesheet_4x.png'],
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>;

function artUrl(file: string): string {
  const hit = Object.entries(ART_BUILD).find(([k]) => k.endsWith(`/${file}`));
  if (!hit) throw new Error(`assets: ${file} is not in the art build`);
  return hit[1];
}

export const SHEET_URL = artUrl('spritesheet.png');
export const SHEET_META_URL = artUrl('spritesheet.json');

export const BACKGROUND_URLS: Record<BackgroundKey, string> = Object.fromEntries(
  BACKGROUND_KEYS.map((k) => [k, artUrl(`background_${k}.png`)]),
) as Record<BackgroundKey, string>;
