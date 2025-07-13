interface IEntrySuccessful {
    type: string;
}

interface IEntryFailed {
    msg: string;
}

export type IEntryResponse = Partial<IEntrySuccessful> & Partial<IEntryFailed>;
