import {IEntryFailed, IEntrySuccessful} from "../interfaces";
import * as Joi from "joi";
import {logger} from "@utils/logger";

const entrySuccessfulSchema = Joi.object<IEntrySuccessful>({
    entry_count: Joi.string(),
    points: Joi.string(),
    type: Joi.string()
}).unknown(true).strip(true);

export function instanceOfIEntrySuccessful(data: unknown): data is IEntrySuccessful {
    const validationResult = entrySuccessfulSchema.validate(data);
    if (validationResult.error) logger.error(validationResult.error);
    return !validationResult.error;
}

const entryFailedSchema = Joi.object<IEntryFailed>({
    msg: Joi.string()
}).unknown(true).strip(true);

export function instanceOfIEntryFailed(data: unknown): data is IEntryFailed {
    const validationResult = entryFailedSchema.validate(data);
    if (validationResult.error) logger.error(validationResult.error);
    return !validationResult.error;
}
