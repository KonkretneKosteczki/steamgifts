import {instanceOfObject} from "./object-instance.validator";
import {IAppReview} from "../interfaces";

export function instanceOfIAppReview(data: unknown): data is IAppReview {
    return instanceOfObject(data)
        && data.hasOwnProperty("success") && typeof data.success === "number"
        && data.hasOwnProperty("query_summary")
        && typeof data.num_reviews === "number"
        && typeof data.review_score === "number"
        && typeof data.review_score_desc === "number"
        && typeof data.total_positive === "number"
        && typeof data.total_negative === "number"
        && typeof data.total_reviews === "number"
        && data.hasOwnProperty("reviews") && Array.isArray("reviews")
        && data.hasOwnProperty("cursor") && typeof data.cursor === "string"
}
