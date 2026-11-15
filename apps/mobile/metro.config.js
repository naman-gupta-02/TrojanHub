// Metro config (P4 shell). One fix on top of Expo's defaults:
//
// npm links workspace packages on Windows as directory junctions, and Metro 0.87 does not
// resolve through them: every `@trojanhub/shared/*` import fails with "Unable to resolve
// module" (a relative import of the same file works, and so does this). Resolving the
// package straight to packages/shared skips the junction. On macOS/Linux the symlink works
// anyway, so this changes nothing there.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const SHARED = '@trojanhub/shared';
const sharedDir = path.resolve(__dirname, '../../packages/shared');

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === SHARED || moduleName.startsWith(`${SHARED}/`)) {
    const subpath = moduleName.slice(SHARED.length + 1) || 'index';
    moduleName = path.join(sharedDir, subpath);
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
