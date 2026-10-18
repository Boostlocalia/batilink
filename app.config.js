// The web build can live under a sub-path (GitHub Pages serves it at /batilink).
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL || undefined },
});
