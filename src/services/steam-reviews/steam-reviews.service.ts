import fetch from "node-fetch";
import {IGameReviewsSummary, ISteamReviewsService,IBaseGameInfo} from "./interfaces";
import {instanceOfIAppReview} from "./validators";
import {LowerBoundConfidence, lowerBoundConfidence} from "@utils/lower-boundary";

export class SteamReviewsService implements ISteamReviewsService {
    // keeping value as a promise so that multiple concurrent calls for the same game will only trigger one API call
    private reviewCacheDictionary: Record<string, Promise<IGameReviewsSummary>> = {};
    private readonly lowerBoundary: LowerBoundConfidence;

    constructor(
        public readonly positiveReviewsLowerBoundary: number,
        reviewLowerBoundaryConfidence: number
    ) {
        this.lowerBoundary = lowerBoundConfidence(reviewLowerBoundaryConfidence);
    }

    public clearCache() {
        this.reviewCacheDictionary = {};
    }

    public getReview(game: IBaseGameInfo): Promise<IGameReviewsSummary> {
        const {name} = game;

        // One cannot review a game bundle on steam, so bundles are interpreted as games with high positive review count
        const reviewSummary = this.reviewCacheDictionary[name] ?? 
              (game.isBundle
                ? Promise.resolve({total_positive: 2000, total_reviews: 2000})
                : this.getReviewSummary(game.steamUrl));
        this.reviewCacheDictionary[name] = reviewSummary;
        return reviewSummary;
    }

    private getReviewSummary(steamUrl: string): Promise<IGameReviewsSummary> {
        return fetch(steamUrl)
            .then((res) => res.json())
            .then((data) => {
                if (!instanceOfIAppReview(data)) return {total_reviews: 0, total_positive: 0};
                return {
                    total_reviews: data.query_summary.total_reviews,
                    total_positive: data.query_summary.total_positive
                }
            })
            .catch(() => ({total_reviews: 0, total_positive: 0})); // game removed or never added to the steam store;
    }

    public gameReviewFilter<T extends {reviewSummary: IGameReviewsSummary}>(
        gameList: Array<T>,
        pinned: boolean
    ): {accepted: Array<T & {lowerBoundary: number}>, rejected: Array<T & {lowerBoundary: number}>} {
        return gameList.reduce((lists, game) => {
            const {reviewSummary: {total_positive, total_reviews}} = game;
            const lowerBoundary = this.lowerBoundary(total_positive, total_reviews);

            return lowerBoundary >= this.positiveReviewsLowerBoundary ?
                {accepted: [...lists.accepted, {...game, lowerBoundary}], rejected: lists.rejected} :
                {rejected: [...lists.rejected, {...game, lowerBoundary}], accepted: lists.accepted};
        }, {accepted: [], rejected: []});
    }
}
