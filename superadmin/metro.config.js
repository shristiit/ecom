const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
const defaultResolveRequest = config.resolver.resolveRequest;

config.watchFolders = [
  path.resolve(projectRoot, '..', 'admin'),
  path.resolve(projectRoot, '..', 'components'),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@superadmin/')) {
    const target = path.join(projectRoot, moduleName.slice('@superadmin/'.length));
    return context.resolveRequest(context, target, platform);
  }

  if (moduleName.startsWith('@admin/')) {
    const target = path.join(projectRoot, '..', 'admin', moduleName.slice('@admin/'.length));
    return context.resolveRequest(context, target, platform);
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: './app/global.css',
});
