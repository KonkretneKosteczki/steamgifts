import {instanceOfObject} from "@utils/object-instance.validator";
import {IEntryFailed, IEntrySuccessful} from "../interfaces";

export function instanceOfIEntrySuccessful(data: unknown): data is IEntrySuccessful {
    return instanceOfObject(data)
        && data.hasOwnProperty("entry_count") && typeof data.entry_count === "string"
        && data.hasOwnProperty("points") && typeof data.points === "string"
        && data.hasOwnProperty("type") && typeof data.type === "string"
}

export function instanceOfIEntryFailed(data: unknown): data is IEntryFailed {
    return instanceOfObject(data) && data.hasOwnProperty("msg") && typeof data.msg === "string";
}
