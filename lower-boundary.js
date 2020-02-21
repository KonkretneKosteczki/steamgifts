// Node.js implementation of Evan Miller's algorithm for ranking stuff based on upvotes:
// http://www.evanmiller.org/how-not-to-sort-by-average-rating.html

const stats = require('simple-statistics');

function lowerBoundConfidence(confidence) {
    // for performance purposes memorize the calculation for z
    const z = stats.probit(1 - (1 - confidence) / 2);
    return (totalPositive, total) => lowerBoundary(totalPositive, total, z);
}

function lowerBoundary(totalPositive, total = 0, z) {
    if (total === 0) return 0;
    // p̂, the fraction of positive
    const phat = 1.0 * totalPositive / total;
    return (phat + z * z / (2 * total) - z *
        Math.sqrt((phat * (1 - phat) + z * z / (4 * total)) / total)) / (1 + z * z / total);
}

module.exports = {lowerBoundary, lowerBoundConfidence};
