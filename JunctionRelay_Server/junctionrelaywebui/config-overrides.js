const webpack = require('webpack');

module.exports = function override(config) {
  // Fix for @mui/x-charts ESM imports in webpack
  config.module.rules.push({
    test: /\.m?js$/,
    resolve: {
      fullySpecified: false,
    },
  });

  // Provide process global for FrameEngine and dependencies (webpack 5 compatibility)
  config.plugins.push(
    new webpack.ProvidePlugin({
      process: 'process/browser',
    })
  );

  // Fallback for process (webpack 5 removed automatic polyfills)
  config.resolve.fallback = {
    ...config.resolve.fallback,
    process: require.resolve('process/browser'),
  };

  return config;
};
