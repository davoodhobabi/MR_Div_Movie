const { getDefaultConfig } = require('expo/metro-config');
const { startLocalFolderProxy } = require('./lib/catalog/folderListingProxy.cjs');

const isExport = process.argv.some(
  (arg) => arg === 'export' || arg.includes('export:web'),
);
if (!isExport) {
  // Expo SPA middleware swallows /api when web.output is `single`.
  startLocalFolderProxy();
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
