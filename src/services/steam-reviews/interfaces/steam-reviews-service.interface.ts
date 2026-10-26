import type {IGameReviewsSummary} from "./game-reviews-summary.interface";
import type {IBaseGameInfo} from "./base-game-info.interface";

export interface ISteamReviewsService {
    forceClearCache(): void;
    getReviewV2(game: IBaseGameInfo): Promise<IGameReviewsSummary>;
    gameReviewFilter<T extends {reviewSummary: IGameReviewsSummary}>(gameList: Array<T>, pinned: boolean):
        {accepted: Array<T & {lowerBoundary: number}>, rejected: Array<T & {lowerBoundary: number}>};
}
