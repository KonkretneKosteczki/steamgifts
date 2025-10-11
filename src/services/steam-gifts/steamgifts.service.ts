import fetch from "node-fetch"
import {load as cheerioLoad} from "cheerio";
import {logger} from "@utils/logger";
import {URLSearchParams} from "url";
import * as pLimit from "p-limit";
import {waitMs} from "@utils/wait";
import {ISteamReviewsService} from "../steam-reviews/interfaces";
import {IParsedPageHeading, IGame, IParsedPage, ISteamgiftsService} from "./interfaces";
import {instanceOfIEntryResponse} from "./validators";


export class SteamGifts implements ISteamgiftsService {
    private readonly ignoredGames: Array<string> = []; // Previously won
    private readonly headers: Record<string, string>;
    private readonly limit: pLimit.Limit;

    private checkedPinned: boolean = false;
    private pageNr: number = 0;
    private page: {url: string, applyReviewFilter: boolean};

    constructor(
        private readonly xsrfToken: string,
        concurrency: number,
        private readonly waitTime: number,
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
            const giveawayPagesLeft = await this.processNextPage();
            if (!giveawayPagesLeft) break;
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

    async processNextPage(): Promise<boolean> {
        if (!this.page) {
            logger.log("No more giveaways available.");
            this.reset();
            return false;
        }

        const {isLastPage, pointsLeft, gameList, pinnedGameList, error} = await this.getPageContent();
        if (error) {
            logger.error(error);
            this.reset();
            return false;
        }

        logger.log(`Points left: ${pointsLeft}`);
        const gameReviews = await Promise.all([...pinnedGameList, ...gameList].map((gameInfo) => {
            return this.limit(() => this.steamReviewsService.getReview(gameInfo).then((reviewSummary) => ({...gameInfo, reviewSummary})))
        }));

        const pinnedGameReviews = gameReviews.slice(0, pinnedGameList.length);
        const nonPinnedGameReviews = pinnedGameList.length ?
            gameReviews.slice(pinnedGameList.length) :
            gameReviews;


        const pinnedGames = this.checkedPinned
            ? {accepted: [], rejected: []}
            : this.steamReviewsService.gameReviewFilter(pinnedGameReviews, true);
        this.logReviewedGames(pinnedGames, true)

        this.checkedPinned = true;

        const nonPinnedGames = this.page.applyReviewFilter ?
            this.steamReviewsService.gameReviewFilter(nonPinnedGameReviews, false) :
            {accepted: nonPinnedGameReviews.map((game) => ({...game, lowerBoundary: 1})), rejected: []};
        this.logReviewedGames(nonPinnedGames, false)

        const gamesToEnter = [...pinnedGames.accepted, ...nonPinnedGames.accepted].filter((game) => !this.ignoredGames.includes(game.name));
        const gamesCanEnter = Array.from(SteamGifts.gamePointsFilterGenerator(gamesToEnter, pointsLeft));

        await this.enterGiveaways(gamesCanEnter);
        if (gamesToEnter.length > gamesCanEnter.length) {
            logger.log("Run out of points");
            return this.reset(), false;
        }
        if (isLastPage) {
            this.pageNr = 0;
            this.page = this.pagesToVisit[this.pagesToVisit.indexOf(this.page) + 1];
        }
        return true;
    }

    async getPageContent(): Promise<IParsedPage> {
        const currentUrl = this.page.url + ++this.pageNr;
        logger.log(currentUrl, "Visited.");

        return fetch(currentUrl, {headers: this.headers})
            .then((res) => res.text())
            .then((htmlBody) => {
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
                    const steamStorePageUrl = $(this).find(".giveaway__icon").attr("href");
                    const steamReviewApiUrl = steamStorePageUrl.substring(0, steamStorePageUrl.indexOf("?"))
                        .replace("app", "appreviews") + "?json=1&num_per_page=0&purchase_type=all&cursor=*&language=all";
                    const isBundle = steamStorePageUrl.startsWith("https://store.steampowered.com/sub/");

                    return {name, giftId, cost, steamUrl: steamReviewApiUrl, isBundle};
                }
            })
            .catch((): IParsedPage => ({
                isLastPage: true,
                pointsLeft: 0,
                gameList: [],
                pinnedGameList: [],
                error: "Failed to fetch page content."
            }))
    }

    logReviewedGames({rejected, accepted}: {accepted: Array<IGame>; rejected: Array<IGame>}, pinned: boolean) {
        if (rejected.length) logger.log(`${pinned ? "Pinned " : ""}Rejected - ${rejected.map(this.gameWithBoundary).join(", ")}`);
        if (accepted.length) logger.log(`${pinned ? "Pinned " : ""}Accepted - ${accepted.map(this.gameWithBoundary).join(", ")}`);
    }

    gameWithBoundary({name, lowerBoundary}: IGame): string {
        // no boundary calculated for wishlist games thus ignored
        return lowerBoundary ? `${name}(${lowerBoundary.toFixed(2)})` : name;
    }

    private static * gamePointsFilterGenerator(allGames: Array<IGame>, maxPoints: number): Generator<IGame, void, void> {
        for (let i = 0, points = maxPoints; i < allGames.length && allGames[i].cost <= points; i++) {
            points -= allGames[i].cost;
            yield allGames[i];
        }
    }

    private enterGiveaways(gameList: Array<IGame>): Promise<Array<void>> {
        return Promise.all(gameList.map((game) => this.limit(() => this.enterGiveaway(game))))
    }

    private enterGiveaway(gameInfo: IGame): Promise<void> {
        const body = new URLSearchParams({
            xsrf_token: this.xsrfToken,
            do: "entry_insert",
            code: gameInfo.giftId
        });

        return fetch("https://www.steamgifts.com/ajax.php", {method: "POST", body, headers: this.headers})
            .then(res => res.json())
            .then((response: unknown) => {
                if (!instanceOfIEntryResponse(response)) return;
                const info = response.type ?? response.msg;
                if (info.includes("Previously Won")) this.ignoredGames.push(gameInfo.name);
                logger.log(`${this.gameWithBoundary(gameInfo)} - ${info}`)
            })
            .catch(() => logger.error(`Failed to fetch - ${this.gameWithBoundary(gameInfo)}`));
    }
}


