import {SteamReviewsService} from "@services/steam-reviews";
import {SteamGifts} from "@services/steam-gifts";
import {config} from "./config";

const sg = new SteamGifts(
    config.xsrfToken,
    config.concurrency,
    config.waitTime,
    config.pagesToVisit,
    new SteamReviewsService(
        config.positiveReviewsLowerBoundary,
        config.reviewLowerBoundaryConfidence,
        config.removedGames,
    ),
    config.sessionId
);

sg.run();
