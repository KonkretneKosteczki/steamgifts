import fetch from "node-fetch";
import {IGameReviewsSummary, ISteamReviewsService,IBaseGameInfo} from "./interfaces";
import {instanceOfIAppReview} from "./validators";
import {LowerBoundConfidence, lowerBoundConfidence} from "@utils/lower-boundary";
import * as NodeCache from "node-cache";

export class SteamReviewsService implements ISteamReviewsService {
    // keeping value as a promise so that multiple concurrent calls for the same game will only trigger one API call
    private readonly reviewCacheDictionary: NodeCache;
    private readonly lowerBoundary: LowerBoundConfidence;

    constructor(
        public readonly positiveReviewsLowerBoundary: number,
        reviewLowerBoundaryConfidence: number,
        private readonly removedGames: boolean,
        reviewCacheCheckPeriod?: number,
        stdTTL?: number,
    ) {
        this.reviewCacheDictionary = new NodeCache({
            stdTTL,
            checkperiod: reviewCacheCheckPeriod,
            useClones: false
        });
        this.lowerBoundary = lowerBoundConfidence(reviewLowerBoundaryConfidence);
    }

    public forceClearCache() {
        this.reviewCacheDictionary.flushAll();
    }

    public getReview({name, isBundle, steamUrl}: IBaseGameInfo): Promise<IGameReviewsSummary> {
        // One cannot review a game bundle on steam, so bundles are interpreted as games with high positive review count
        const reviewSummary = this.reviewCacheDictionary.get<Promise<IGameReviewsSummary>>(name) ??
              (isBundle
                ? Promise.resolve({total_positive: 2000, total_reviews: 2000})
                : this.getReviewSummary(steamUrl));
        this.reviewCacheDictionary.set<Promise<IGameReviewsSummary>>(name, reviewSummary);
        return reviewSummary;
    }

    private getReviewSummary =
        (steamUrl: string): Promise<IGameReviewsSummary> => fetch(steamUrl)
            .then((res) => res.json())
            .then((data) => {
                if (!instanceOfIAppReview(data)) return {total_reviews: 0, total_positive: 0};
                return {
                    total_reviews: data.query_summary.total_reviews,
                    total_positive: data.query_summary.total_positive
                }
            })
            .catch(() =>
                this.removedGames
                    ? {total_reviews: 1000, total_positive: 1000}
                    : {total_reviews: 0, total_positive: 0}
            );

    public gameReviewFilter<T extends {reviewSummary: IGameReviewsSummary}>(gameList: Array<T>):
        {accepted: Array<T & {lowerBoundary: number}>, rejected: Array<T & {lowerBoundary: number}>} {
        return gameList.reduce((lists, game) => {
            const {reviewSummary: {total_positive, total_reviews}} = game;
            const lowerBoundary = this.lowerBoundary(total_positive, total_reviews);

            return lowerBoundary >= this.positiveReviewsLowerBoundary ?
                {accepted: [...lists.accepted, {...game, lowerBoundary}], rejected: lists.rejected} :
                {rejected: [...lists.rejected, {...game, lowerBoundary}], accepted: lists.accepted};
        }, {accepted: [], rejected: []});
    }
}
