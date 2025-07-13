import {IAppReview} from "../interfaces";
import * as Joi from "joi";
import {logger} from "@utils/logger";

const appReviewSchema = Joi.object<IAppReview>({
    query_summary: Joi.object({
        total_positive: Joi.number().required(),
        total_reviews: Joi.number().required()
    }).unknown(true).strip(true).required()
}).unknown(true).strip(true)

export function instanceOfIAppReview(data: unknown): data is IAppReview {
    const validationResult = appReviewSchema.validate(data);
    if (validationResult.error) logger.error(validationResult.error);
    return !validationResult.error;
}
