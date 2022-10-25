import {SteamReviewsService} from "@services/steam-reviews";
import {SteamGifts} from "@services/steam-gifts";
import {config} from "./config";

const sg = new SteamGifts(
    config.positiveReviewsLowerBoundary,
    config.xsrfToken,
    config.concurrency,
    config.waitTime,
    config.pagesToVisit,
    new SteamReviewsService(),
    config.reviewLowerBoundaryConfidence,
    config.sessionId
);

sg.run();
