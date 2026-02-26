import {IParsedPageHeading} from "./parsed-page-heading.interface";

export interface IParsedPage {
    gameList: Array<IParsedPageHeading>;
    pinnedGameList: Array<IParsedPageHeading>;
    isLastPage: boolean;
    hasWonAGame: boolean;
    pointsLeft: number;
    error?: string;
}
