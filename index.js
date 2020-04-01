const fetch = require("node-fetch");
const cheerio = require("cheerio");
const {URLSearchParams} = require("url");
const pLimit = require("p-limit");
const {lowerBoundConfidence} = require("./lower-boundary");
const config = require("./config");
const wait = (ms) => new Promise(res => setTimeout(res, ms));

function customLogger(...args) {
    process.stdout.write(`[${new Date().toISOString()}]: ${args.join(" ")}\n`);
}

console.log = customLogger;

class SteamGifts {
    ignoredGames = []; // Previously won
    reviewCacheDictionary = {};

    constructor({positiveReviewsLowerBoundary, sessionId, xsrfToken, concurrency, reviewLowerBoundaryConfidence, waitTime}) {
        this.positiveReviewsLowerBoundary = positiveReviewsLowerBoundary;
        this.headers = {cookie: "PHPSESSID=" + sessionId};
        this.xsrfToken = xsrfToken;
        this.pageNr = 0;
        this.pagesToVisit = config.pagesToVisit;
        this.checkedPinned = false;
        this.page = this.pagesToVisit[0];
        this.limit = pLimit(concurrency);
        this.lowerBoundary = lowerBoundConfidence(reviewLowerBoundaryConfidence);
        this.waitTime = waitTime
    }

    // noinspection InfiniteRecursionJS
    async run() {
        while (true) {
            const shouldContinue = await this.handlePage();
            if (!shouldContinue) break;
        }
        await wait(this.waitTime);
        process.stdout.write("\n");
        this.run();
    }

    reset() {
        this.page = this.pagesToVisit[0];
        this.pageNr = 0;
        this.reviewCacheDictionary = {};
        this.checkedPinned = false;
    }

    async handlePage() {
        if (!this.page) {
            this.reset();
            return Promise.reject(null);
        }

        const {isLastPage, pointsLeft, gameList, pinnedGameList} = this.newParser(await this.getPageContent(), this.pageNr);
        const gameReviews = await this.getReviews([...pinnedGameList, ...gameList]);

        const pinnedGameReviews = gameReviews.slice(0, pinnedGameList.length);
        const nonPinnedGameReviews = pinnedGameList.length ?
            gameReviews.slice(pinnedGameList.length) :
            gameReviews;


        const pinnedGamesToEnter = this.checkedPinned ? [] : this.gameReviewFilter(pinnedGameReviews, true);
        this.checkedPinned = true;
        const nonPinnedGamesToEnter = this.page.applyReviewFilter ?
            this.gameReviewFilter(nonPinnedGameReviews, false) :
            nonPinnedGameReviews;

        const gamesToEnter = [...pinnedGamesToEnter, ...nonPinnedGamesToEnter].filter(game => !this.ignoredGames.includes(game.name));
        const gamesCanEnter = Array.from(this.gamePointsFilterGenerator(gamesToEnter, pointsLeft));

        await this.enterGiveAways(gamesCanEnter);
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

    getPageContent() {
        const currentUrl = this.page.url + ++this.pageNr;

        console.log(currentUrl, "Visited.");
        return fetch(currentUrl, {headers: this.headers})
            .then(res => res.text());
    }

    newParser(htmlBody, currentPage = 1) {
        const $ = cheerio.load(htmlBody);

        const pinnedGameList = $("div.pinned-giveaways__inner-wrap > div > div:not(.is-faded) > div.giveaway__summary > h2.giveaway__heading")
            .map(parseHeading).get();
        const gameList = $("div:not(.pinned-giveaways__inner-wrap) > div > div:not(.is-faded) > div.giveaway__summary > h2.giveaway__heading")
            .map(parseHeading).get();
        const isLastPage = !Boolean($(`[data-page-number="${currentPage + 1}"]`).length);
        const pointsLeft = $("span.nav__points").text();

        return {gameList, pinnedGameList, isLastPage, pointsLeft};

        function parseHeading() {
            const heading = $(this).find(".giveaway__heading__name");

            const name = heading.text();
            const giftId = heading.attr("href").match(/(?<=giveaway\/).*?(?=\/)/)[0];
            const cost = parseInt($(this).find(".giveaway__heading__thin").text().match(/[0-9]+(?=P)/)[0]);
            const steamUrl = $(this).find(".giveaway__icon").attr("href").replace("app", "appreviews") + "?json=1&num_per_page=0&purchase_type=all&cursor=*&language=all";
            const isBundle = steamUrl.startsWith("https://store.steampowered.com/sub/");

            return {name, giftId, cost, steamUrl, isBundle};
        }
    }

    getReviews(gameList) {
        return Promise.all(gameList.map(game => this.limit(() => {
            // no reviews for game bundles, possible introduce another way of handling
            // for now assume some high positive number to enter
            const {name} = game;
            if (this.reviewCacheDictionary[name]) return this.reviewCacheDictionary[name];

            const review = game.isBundle ?
                Promise.resolve({...game, reviewSummary: {total_positive: 2000, total_reviews: 2000}}) :
                this.getReviewSummary(game.steamUrl).then(reviewSummary => ({...game, reviewSummary}));

            this.reviewCacheDictionary[name] = review;
            return review;
        })));
    }

    getReviewSummary(steamUrl) {
        return fetch(steamUrl)
            .then(res => res.json())
            .then(({query_summary: {total_positive, total_reviews, review_score}}) => ({total_reviews, total_positive}))
            .catch(() => ({total_reviews: 0})); // game removed or never added to the steam store;
    }

    gameReviewFilter(gameList, pinned) {
        const {accepted, rejected} = gameList.reduce((lists, game) => {
            const {reviewSummary: {total_positive, total_reviews}} = game;
            const lowerBoundary = this.lowerBoundary(total_positive, total_reviews).toFixed(2);

            return lowerBoundary >= this.positiveReviewsLowerBoundary ?
                {accepted: [...lists.accepted, {...game, lowerBoundary}], rejected: lists.rejected} :
                {rejected: [...lists.rejected, {...game, lowerBoundary}], accepted: lists.accepted};
        }, {accepted: [], rejected: []});

        if (rejected.length) console.log(`${pinned ? "Pinned " : ""}Rejected - ${rejected.map(this.gameWithBoundary).join(", ")}`);
        return accepted;
    }

    gameWithBoundary({name, lowerBoundary}) {
        // no boundary calculated for wishlist games thus ignored
        return lowerBoundary ? `${name}(${lowerBoundary})` : name;
    }

    * gamePointsFilterGenerator(allGames, maxPoints) {
        for (let i = 0, points = maxPoints; i < allGames.length && allGames[i].cost <= points; i++) {
            points -= allGames[i].cost;
            yield allGames[i];
        }
    }

    enterGiveAways(gameList) {
        return Promise.all(gameList.map(game => this.limit(() => this.enterGiveAway(game))))
    }


    enterGiveAway({giftId, ...gameInfo}) {
        const body = new URLSearchParams({
            xsrf_token: this.xsrfToken,
            do: "entry_insert",
            code: giftId
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


const sg = new SteamGifts(config);

sg.run();
