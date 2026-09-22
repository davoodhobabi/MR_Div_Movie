const { handleMediaRange } = require('../lib/catalog/folderListingProxy.cjs');

module.exports = async function mediaRange(req, res) {
  await handleMediaRange(req, res, { force: true });
};
