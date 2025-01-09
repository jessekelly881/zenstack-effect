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
