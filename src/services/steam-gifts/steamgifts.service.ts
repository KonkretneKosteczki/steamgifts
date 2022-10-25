import fetch from "node-fetch"
import {load as cheerioLoad} from "cheerio";
import {customLogger} from "@utils/logger";
import {URLSearchParams} from "url";
import pLimit, {Limit as LimitFunction} from "p-limit";
import {waitMs} from "@utils/wait";
import {ISteamReviewsService} from "../steam-reviews/interfaces";
import {IParsedPageHeading} from "./interfaces/parsed-page-heading.interface";
import {IGame} from "./interfaces/game.interface";
import {IParsedPage} from "./interfaces/parsed-page.interface";
import {ISteamgiftsService} from "./interfaces/steamgifts-service.interface";


console.log = customLogger;


export class SteamGifts implements ISteamgiftsService {
    private readonly ignoredGames: Array<string> = []; // Previously won
    private readonly headers: Record<string, string>;
    private readonly limit: LimitFunction;

    private checkedPinned: boolean = false;
    private pageNr: number = 0;
    private page: {url: string, applyReviewFilter: boolean};

    constructor(
        public readonly xsrfToken: string,
        public readonly concurrency: number,
        public readonly waitTime: number,
        private readonly pagesToVisit: Readonly<Array<{readonly url: string; readonly applyReviewFilter: boolean}>>,
        private readonly steamReviewsService: ISteamReviewsService,
        sessionId: string
    ) {
        this.headers = {cookie: "PHPSESSID=" + sessionId};
        this.page = this.pagesToVisit[0];
        this.limit = pLimit(concurrency);
    }

    // noinspection InfiniteRecursionJS
    public async run() {
        while (true) {
            const shouldContinue = await this.handlePage();
            if (!shouldContinue) break;
        }
        await waitMs(this.waitTime);
        process.stdout.write("\n");
        this.run();
    }

    public reset() {
        this.page = this.pagesToVisit[0];
        this.pageNr = 0;
        this.steamReviewsService.clearCache();
        this.checkedPinned = false;
    }

    async handlePage() {
        if (!this.page) {
            this.reset();
            return Promise.reject(null);
        }

        const {isLastPage, pointsLeft, gameList, pinnedGameList} = await this.getPageContent();
        const gameReviews = await Promise.all([...pinnedGameList, ...gameList].map((gameInfo) => {
            return this.limit(() => this.steamReviewsService.getReview(gameInfo).then((reviewSummary) => ({...gameInfo, reviewSummary})))
        }));

        const pinnedGameReviews = gameReviews.slice(0, pinnedGameList.length);
        const nonPinnedGameReviews = pinnedGameList.length ?
            gameReviews.slice(pinnedGameList.length) :
            gameReviews;


        const pinnedGamesToEnter = this.checkedPinned
            ? []
            : this.steamReviewsService.gameReviewFilter(pinnedGameReviews, true).accepted;

        this.checkedPinned = true;
        const nonPinnedGamesToEnter = this.page.applyReviewFilter ?
            this.steamReviewsService.gameReviewFilter(nonPinnedGameReviews, false).accepted :
            nonPinnedGameReviews.map((game) => ({...game, lowerBoundary: 1}));

        const gamesToEnter = [...pinnedGamesToEnter, ...nonPinnedGamesToEnter].filter((game) => !this.ignoredGames.includes(game.name));
        const gamesCanEnter = Array.from(this.gamePointsFilterGenerator(gamesToEnter, pointsLeft));

        await this.enterGiveaways(gamesCanEnter);
        if (gamesToEnter.length > gamesCanEnter.length) {
            console.log("Run out of points");
            return this.reset();
        }
        if (isLastPage) {
            this.pageNr = 0;
            this.page = this.pagesToVisit[this.pagesToVisit.indexOf(this.page) + 1];
        }
        return true;
    }

    async getPageContent(): Promise<IParsedPage> {
        const currentUrl = this.page.url + ++this.pageNr;
        console.log(currentUrl, "Visited.");

        const htmlBody = await fetch(currentUrl, {headers: this.headers}).then(res => res.text());
        const $ = cheerioLoad(htmlBody);

        const pinnedGameList = $("div.pinned-giveaways__inner-wrap > div > div:not(.is-faded) > div.giveaway__summary > h2.giveaway__heading")
            .map(parseHeading).get();
        const gameList = $("div:not(.pinned-giveaways__inner-wrap) > div > div:not(.is-faded) > div.giveaway__summary > h2.giveaway__heading")
            .map(parseHeading).get();
        const isLastPage = !Boolean($(`[data-page-number="${this.pageNr + 1}"]`).length);
        const pointsLeft = Number($("span.nav__points").text());

        return {gameList, pinnedGameList, isLastPage, pointsLeft};

        function parseHeading(): IParsedPageHeading {
            const heading = $(this).find(".giveaway__heading__name");

            const name = heading.text();
            const giftId = heading.attr("href").match(/(?<=giveaway\/).*?(?=\/)/)[0];
            const cost = parseInt($(this).find(".giveaway__heading__thin").text().match(/[0-9]+(?=P)/)[0]);
            const steamUrl = $(this).find(".giveaway__icon").attr("href").replace("app", "appreviews") + "?json=1&num_per_page=0&purchase_type=all&cursor=*&language=all";
            const isBundle = steamUrl.startsWith("https://store.steampowered.com/sub/");

            return {name, giftId, cost, steamUrl, isBundle};
        }
    }

    gameWithBoundary({name, lowerBoundary}: IGame): string {
        // no boundary calculated for wishlist games thus ignored
        return lowerBoundary ? `${name}(${lowerBoundary})` : name;
    }

    * gamePointsFilterGenerator(allGames: Array<IGame>, maxPoints: number): Generator<IGame, void, void> {
        for (let i = 0, points = maxPoints; i < allGames.length && allGames[i].cost <= points; i++) {
            points -= allGames[i].cost;
            yield allGames[i];
        }
    }

    enterGiveaways(gameList: Array<IGame>): Promise<Array<void>> {
        return Promise.all(gameList.map((game: IGame) => this.limit(() => this.enterGiveaway(game))))
    }


    enterGiveaway(gameInfo: IGame): Promise<void> {
        const body = new URLSearchParams({
            xsrf_token: this.xsrfToken,
            do: "entry_insert",
            code: gameInfo.giftId
        });

        return fetch("https://www.steamgifts.com/ajax.php", {method: "POST", body, headers: this.headers})
            .then(res => res.json())
            .then(({type, msg}) => {
                const info = msg || type;
                if (info.includes("Previously Won")) this.ignoredGames.push(gameInfo.name);
                console.log(`${this.gameWithBoundary(gameInfo)} - ${info}`)
            });
    }
}


