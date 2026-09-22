const { handlePosterImage } = require('../lib/catalog/imdbPoster.cjs');

/** Vercel: stream IMDb posters (Amazon reachable from Vercel; browser stays same-origin). */
module.exports = async function posterImage(req, res) {
  await handlePosterImage(req, res, { force: true });
};

module.exports.maxDuration = 20;
