const { proxyIran } = require('../lib/catalog/iranUpstream.cjs');

module.exports = async function mediaRange(req, res) {
  await proxyIran(req, res);
};

module.exports.maxDuration = 30;
