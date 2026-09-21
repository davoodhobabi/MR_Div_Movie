const { handleMediaResolve } = require('../lib/catalog/folderListingProxy.cjs');

module.exports = async function mediaResolve(req, res) {
  await handleMediaResolve(req, res, { force: true });
};
