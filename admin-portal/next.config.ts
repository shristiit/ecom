const withTM = require('next-transpile-modules')([
  '@gluestack-ui/themed',
  '@gluestack-style/react',
  'react-native-svg',
]);

module.exports = withTM({
  reactStrictMode: true,
 // experimental: { esmExternals: 'loose' },
});
