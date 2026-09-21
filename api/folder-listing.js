const { handleFolderListing } = require('../lib/catalog/folderListingProxy.cjs');

module.exports = async function folderListing(req, res) {
  await handleFolderListing(req, res, { force: true });
};
