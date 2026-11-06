// Private mode: BatiNode runs for its owner only, with everything that costs money paused
// (sign-ups, plans and Stripe, ads tracking, the assistant). The server enforces it on its
// own (table private_mode, see docs/MODE-PRIVE.md); this flag only adapts the screens.
// Reopen to the public: set EXPO_PUBLIC_PRIVATE_MODE to off in .github/workflows/deploy-web.yml.
export const PRIVATE_MODE = process.env.EXPO_PUBLIC_PRIVATE_MODE === 'on';
