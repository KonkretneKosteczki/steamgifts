export interface IAppReview {
    success: number;
    query_summary: {
        num_reviews: number;
        review_score: number;
        review_score_desc: string;
        total_positive: number,
        total_negative: number,
        total_reviews: number
    }
    // actual reviews ignored for the purpose of the app, only care about number of positive and negative reviews
    reviews: Array<unknown>;
    cursor: string;
}
