import { Image } from 'expo-image';

import { APP_NAME } from '@/constants/brand';

// The wordmark on a transparent background, 1957 x 463, rebuilt in Poppins Bold from the chosen logo.
const SOURCE = require('../../assets/brand/batinode-logo.png');
const RATIO = 1957 / 463;

/** "batinode" written out, its "o" drawn as a network node. `size` is the height of the letters' line. */
export function Logo({ size = 22 }: { size?: number }) {
  const height = Math.round(size * 1.3);
  return <Image source={SOURCE} accessibilityLabel={APP_NAME} contentFit="contain" style={{ height, width: Math.round(height * RATIO) }} />;
}
