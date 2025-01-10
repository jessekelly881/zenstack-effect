import { Schema } from "effect";

export const Decimal = Schema.Union(
    Schema.Number,
    Schema.String,
    Schema.Struct({
        d: Schema.Array(Schema.Number),
        e: Schema.Number,
        s: Schema.Number
    }).pipe(
        Schema.extend(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
    )
);

/**
 * @see https://github.com/zenstackhq/zenstack/blob/4b7d813624b4e73fcf8fd14d2849d5b1aef6aae3/packages/schema/src/plugins/zod/utils/schema-gen.ts#L195
 */
export const Bytes = Schema.Union(
    Schema.String,
    Schema.Uint8ArrayFromSelf
)
