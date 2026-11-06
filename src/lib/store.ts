import { Platform } from 'react-native';

/**
 * Plans are sold on the web only. In the iPhone and Android apps no price, purchase
 * button or link to buy is shown (App Store 3.1.1 and Google Play billing rules):
 * subscribers simply sign in and use what their company already has.
 */
export const SELLS_PLANS = Platform.OS === 'web';
