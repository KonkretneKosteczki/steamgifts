import type {IEntryResponse} from "../interfaces";
import * as Joi from "joi";
import {logger} from "@utils/logger";

const entryResponseSchema = Joi.object<IEntryResponse>({
    type: Joi.string(),
    msg: Joi.string()
}).unknown(true).strip(true).or("type", "msg");

export function instanceOfIEntryResponse(data: unknown): data is IEntryResponse {
    const validationResult = entryResponseSchema.validate(data);
    if (validationResult.error) logger.error(validationResult.error);
    return !validationResult.error;
}
