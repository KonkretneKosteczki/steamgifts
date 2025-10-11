import {IParsedPageHeading} from "./parsed-page-heading.interface";

export interface IParsedPage {
    gameList: Array<IParsedPageHeading>;
    pinnedGameList: Array<IParsedPageHeading>;
    isLastPage: boolean;
    pointsLeft: number;
    error?: string;
}
