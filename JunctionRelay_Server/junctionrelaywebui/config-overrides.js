module.exports = function override(config) {
  // Fix for @mui/x-charts ESM imports in webpack
  config.module.rules.push({
    test: /\.m?js$/,
    resolve: {
      fullySpecified: false,
    },
  });

  return config;
};
