import { Image } from 'expo-image';

import { APP_NAME } from '@/constants/brand';
import { mediaUrl } from '@/lib/banners';

// logo/batinode.png: the full wordmark on a transparent background, 815 x 210.
const RATIO = 815 / 210;

/** "batinode" written out, its "o" drawn as a network node. `size` is the height of the letters' line. */
export function Logo({ size = 22 }: { size?: number }) {
  const height = Math.round(size * 1.3);
  return (
    <Image
      source={{ uri: mediaUrl('logo/batinode.png') }}
      accessibilityLabel={APP_NAME}
      contentFit="contain"
      style={{ height, width: Math.round(height * RATIO) }}
    />
  );
}
