import {IGameReviewsSummary} from "./game-reviews-summary.interface";
import {IBaseGameInfo} from "./base-game-info.interface";

export interface ISteamReviewsService {
    forceClearCache(): void;
    getReview(game: IBaseGameInfo): Promise<IGameReviewsSummary>;
    gameReviewFilter<T extends {reviewSummary: IGameReviewsSummary}>(gameList: Array<T>, pinned: boolean):
        {accepted: Array<T & {lowerBoundary: number}>, rejected: Array<T & {lowerBoundary: number}>};
}
