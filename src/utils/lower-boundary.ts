// Node.js implementation of Evan Miller's algorithm for ranking stuff based on upvotes:
// http://www.evanmiller.org/how-not-to-sort-by-average-rating.html
import {probit} from "simple-statistics";

export type LowerBoundConfidence = (totalPositive: number, total: number) => number;

export function lowerBoundConfidence(confidence: number): LowerBoundConfidence {
    // for performance purposes memorize the calculation for z
    const z = probit(1 - (1 - confidence) / 2);
    return (totalPositive, total) => lowerBoundary(totalPositive, total, z);
}

export function lowerBoundary(totalPositive: number, total = 0, z: number): number {
    if (total === 0) return 0;
    // p̂, the fraction of positive
    const phat = totalPositive / total;
    return (phat + z * z / (2 * total) - z *
        Math.sqrt((phat * (1 - phat) + z * z / (4 * total)) / total)) / (1 + z * z / total);
}
