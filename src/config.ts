export const config = {
    // link to the steamgifts api, in theory there should not be a need to manually change it,
    //  but left in config just in case of future implementation modifications
    steamgiftsAPI: "https://www.steamgifts.com/ajax.php",

    // order of queries is based on the index of the pagesToVisit, and whether reviews are applied to game from
    //  particular page as well, the pinned giveaways have review filter applied based on the PinnedGiveaways parameter
    pinnedGiveaways: {applyReviewFilter: true},
    pagesToVisit: [
        {url: "https://www.steamgifts.com/giveaways/search?type=wishlist&page=", applyReviewFilter: false},
        {url: "https://www.steamgifts.com/giveaways/search?dlc=true&page=", applyReviewFilter: false},
        {url: "https://www.steamgifts.com/giveaways/search?type=recommended&page=", applyReviewFilter: true},
        {url: "https://www.steamgifts.com/giveaways/search?copy_min=2&page=", applyReviewFilter: true},
        {url: "https://www.steamgifts.com/giveaways/search?page=", applyReviewFilter: true},
    ],

    // how positive reviews have to be for the app to enter them
    positiveReviewsLowerBoundary: 0.7,

    // your tokens that would allow direct access to steamgifts api
    sessionId: process.env.SESSION_ID ?? "<sessionId>",
    xsrfToken: process.env.XSRF_TOKEN ?? "<xsrf_token>",

    // how many concurrent requests should the app perform, it applied to requests to the store to retrieve reviews
    //  as well as to the requests to steamgifts api to enter the giveaways, increasing the value will increase the
    //  application speed and internet connection, cpu usage
    concurrency: 5,

    // how confident should the Evan Miller's algorithm be that the reviews are as positive as requested
    reviewLowerBoundaryConfidence: 0.95,

    // delay in milliseconds between application cycles
    waitTime: 1000 * 60 * 15
} as const;
