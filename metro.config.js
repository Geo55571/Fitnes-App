// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 3D avatar models are bundled as binary glTF assets.
config.resolver.assetExts.push('glb');

module.exports = config;
