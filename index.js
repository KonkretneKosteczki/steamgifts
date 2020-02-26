const fetch = require("node-fetch");
const cheerio = require("cheerio");
const {URLSearchParams} = require("url");
const pLimit = require("p-limit");
const {lowerBoundConfidence} = require("./lower-boundary");

const wait = (ms) => new Promise(res => setTimeout(res, ms));

class SteamGifts {
    constructor(positiveReviewsLowerBoundary, sessionId, concurrency = 5, reviewLowerBoundaryConfidence=0.95) {
        this.positiveReviewsLowerBoundary = positiveReviewsLowerBoundary;
        this.headers = {cookie: "PHPSESSID=" + sessionId};
        this.pageNr = 0;
        this.pageToVisit = [
            {url: "https://www.steamgifts.com/giveaways/search?type=wishlist&page=", applyReviewFilter: false},
            {url: "https://www.steamgifts.com/giveaways/search?type=recommended&page=", applyReviewFilter: true},
            {url: "https://www.steamgifts.com/giveaways/search?page=", applyReviewFilter: true},
        ];
        this.page = this.pageToVisit[0];
        this.limit = pLimit(concurrency)
        this.lowerBoundary = lowerBoundConfidence(reviewLowerBoundaryConfidence)
    }

    async run() {
        while (await this.handlePage().catch(console.error)) {
        }
        await wait(1000 * 60 * 15);
        await this.run();
    }

    reset() {
        this.page = this.pageToVisit[0];
        this.pageNr = 0;
    }

    handlePage() {
        if (!this.page) {
            this.reset();
            return Promise.reject(null);
        }

        return this.getPageContent().then(content => {
            const {isLastPage, pointsLeft, gameList, pinnedGameList} = this.newParser(content, this.pageNr);

            if (isLastPage) {
                this.pageNr = 0;
                this.page = this.pageToVisit[this.pageToVisit.indexOf(this.page) + 1];
            }

            return this.getReviews([...pinnedGameList, ...gameList])
                .then(gameReviews => {
                    const pinnedGameReviews = gameReviews.slice(0, pinnedGameList.length);
                    const nonPinnedGameReviews = pinnedGameList.length ?
                        gameReviews.slice(pinnedGameList.length) :
                        gameReviews;

                    const pinnedGamesToEnter = Array.from(this.gameReviewFilterGenerator(pinnedGameReviews));
                    const nonPinnedGamesToEnter = this.page.applyReviewFilter ?
                        Array.from(this.gameReviewFilterGenerator(nonPinnedGameReviews)) :
                        nonPinnedGameReviews;

                    const gamesToEnter = [...pinnedGamesToEnter, ...nonPinnedGamesToEnter];
                    const gamesCanEnter = Array.from(this.gamePointsFilterGenerator(gamesToEnter, pointsLeft));

                    return this.enterGiveAways(gamesCanEnter).then(()=>{
                        if (gamesToEnter.length > gamesCanEnter.length) {
                            this.reset();
                            throw "Run out of points";
                        }
                        else return true;
                    });
                });
        })
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
            const isBundle = steamUrl.startsWith("https://store.steampowered.com/sub/")

            return {name, giftId, cost, steamUrl, isBundle};
        }
    }

    getReviews(gameList) {
        return Promise.all(gameList.map(game => this.limit(() => {
            // no reviews for game bundles, possible introduce another way of handling
            // for now assume some high positive number to enter
            if (game.isBundle) return {...game, reviewSummary: {total_positive: 2000, total_reviews: 2000}};
            else return this.getReviewSummary(game.steamUrl)
                .then(reviewSummary => ({...game, reviewSummary}))
        })));
    }

    getReviewSummary(steamUrl) {
        return fetch(steamUrl)
            .then(res => res.json())
            .then(({query_summary: {total_positive, total_reviews, review_score}}) => ({total_reviews, total_positive}))
            .catch(() => ({total_reviews: 0})); // game removed or never added to the steam store;
    }

    * gameReviewFilterGenerator(gameList) {
        for (let i =0; i< gameList.length; i++){
            const {total_positive, total_reviews} = gameList[i].reviewSummary;
            if (this.lowerBoundary(total_positive, total_reviews) >= this.positiveReviewsLowerBoundary)
                yield gameList[i];
        }
    }

    * gamePointsFilterGenerator(allGames, maxPoints) {
        let points = maxPoints;
        for (let i =0; i < allGames.length && allGames[i].cost <= points; i++){
            points -= allGames[i].cost;
            yield allGames[i];
        }
    }

    enterGiveAways(gameList) {
        return Promise.all(gameList.map(game => this.limit(() => this.enterGiveAway(game))))
    }


    enterGiveAway({name, giftId}) {
        const body = new URLSearchParams({
            xsrf_token: "bd0dec49000166143519a1babd691d7b",
            do: "entry_insert",
            code: giftId
        });

        return fetch("https://www.steamgifts.com/ajax.php", {method: "POST", body, headers: this.headers})
            .then(res => res.json())
            .then(({type, msg}) => console.log(`${name}: ${msg || type}`));
    }
}


const sg = new SteamGifts(0.7, "<token here>");

sg.run();
