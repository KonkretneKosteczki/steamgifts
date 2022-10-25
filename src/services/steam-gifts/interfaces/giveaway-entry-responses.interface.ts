export interface IEntrySuccessful {
    entry_count: `${number}`;
    points: `${number}`;
    type: string;
}

export interface IEntryFailed {
    msg: string;
}
