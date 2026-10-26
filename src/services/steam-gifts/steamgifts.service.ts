import { Impit } from "impit";
import {load as cheerioLoad} from "cheerio";
import {logger} from "@utils/logger";
import * as pLimit from "p-limit";
import {waitMs} from "@utils/wait";
import {ISteamReviewsService} from "../steam-reviews/interfaces";
import {IParsedPageHeading, IGame, IParsedPage, ISteamgiftsService} from "./interfaces";
import {instanceOfIEntryResponse} from "./validators";


export class SteamGifts implements ISteamgiftsService {
    private readonly ignoredGames: Array<string> = []; // Previously won
    private readonly impersonator: Impit;
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
        this.impersonator = new Impit({
            browser: "firefox",
            http3: true,
            ignoreTlsErrors: true,
            followRedirects: true,
            headers: {cookie: "PHPSESSID=" + sessionId}
        });
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
        this.checkedPinned = false;
    }

    async processNextPage(): Promise<boolean> {
        if (!this.page) {
            logger.log("No more giveaways available.");
            this.reset();
            return false;
        }

        const {isLastPage, hasWonAGame, pointsLeft, gameList, pinnedGameList, error} = await this.getPageContent();
        if (error) {
            logger.error(error);
            this.reset();
            return false;
        }

        if (hasWonAGame) logger.log("HAS WON A GAME!!!")
        logger.log(`Points left: ${pointsLeft}`);
        const gameReviews = await Promise.all([...pinnedGameList, ...gameList].map((gameInfo) => {
            return this.limit(() => this.steamReviewsService.getReviewV2(gameInfo).then((reviewSummary) => ({...gameInfo, reviewSummary})))
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

        return this.impersonator.fetch(currentUrl)
            .then((res) => res.text())
            .then((htmlBody) => {
                const $ = cheerioLoad(htmlBody);

                const pinnedGameList = $("div.pinned-giveaways__inner-wrap > div > div:not(.is-faded) > div.giveaway__summary > h2.giveaway__heading")
                    .map(parseHeading).get();
                const gameList = $("div:not(.pinned-giveaways__inner-wrap) > div > div:not(.is-faded) > div.giveaway__summary > h2.giveaway__heading")
                    .map(parseHeading).get();
                const isLastPage = !Boolean($(`[data-page-number="${this.pageNr + 1}"]`).length);
                const pointsLeft = Number($("span.nav__points").text());

                const hasWonAGame = $(`a.nav__button[title="Giveaways Won"] > div.nav__notification`).length > 0;

                return {gameList, pinnedGameList, isLastPage, pointsLeft, hasWonAGame};

                function parseHeading(): IParsedPageHeading {
                    const heading = $(this).find(".giveaway__heading__name");

                    const name = heading.text();
                    const giftId = heading.attr("href").match(/(?<=giveaway\/).*?(?=\/)/)[0];
                    const cost = parseInt($(this).find(".giveaway__heading__thin").text().match(/[0-9]+(?=P)/)[0]);
                    const steamStorePageUrl = $(this).find(".giveaway__icon").attr("href");
                    const isBundle = steamStorePageUrl.startsWith("https://store.steampowered.com/sub/");
                    const appId = steamStorePageUrl.substring(
                        steamStorePageUrl.lastIndexOf("/") + 1,
                        steamStorePageUrl.indexOf("?")
                    );

                    return {name, giftId, cost, appId, isBundle};
                }
            })
            .catch((): IParsedPage => ({
                isLastPage: true,
                hasWonAGame: false,
                pointsLeft: 0,
                gameList: [],
                pinnedGameList: [],
                error: "Failed to fetch page content."
            }))
    }

    logReviewedGames({rejected, accepted}: {accepted: Array<IGame>; rejected: Array<IGame>}, pinned: boolean) {
        if (rejected.length) logger.log(`${pinned ? "Pinned " : ""}Rejected - ${rejected.map(this.gameWithBoundaryToString).join(", ")}`);
        if (accepted.length) logger.log(`${pinned ? "Pinned " : ""}Accepted - ${accepted.map(this.gameWithBoundaryToString).join(", ")}`);
    }

    gameWithBoundaryToString({name, lowerBoundary}: IGame): string {
        // perfect 1 boundary only for pages without a filter, thus logged in different way (ex. wishlist, dlc, pinned)
        return `${name}(${lowerBoundary === 1 ? "★" : lowerBoundary.toFixed(2)})`;
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
        const body = new FormData();
        body.append("xsrf_token", this.xsrfToken);
        body.append("do", "entry_insert");
        body.append("code", gameInfo.giftId);

        return this.impersonator.fetch("https://www.steamgifts.com/ajax.php", {method: "POST", body,})
            .then((res) => res.json())
            .then((response: unknown) => {
                if (!instanceOfIEntryResponse(response)) return;
                const info = response.type ?? response.msg;
                if (info.includes("Previously Won")) this.ignoredGames.push(gameInfo.name);
                logger.log(`${this.gameWithBoundaryToString(gameInfo)} - ${info}`)
            })
            .catch(() => logger.error(`Failed to fetch - ${this.gameWithBoundaryToString(gameInfo)}`));
    }
}


