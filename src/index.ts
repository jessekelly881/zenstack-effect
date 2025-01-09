import { NodeContext, NodeRuntime } from "@effect/platform-node";
import type { DMMF } from '@prisma/generator-helper';
import { PluginOptions, resolvePath } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { config } from 'dotenv';
import { Config, Effect } from "effect";
import * as Generator from "./Generator";

config();

export const name = 'ZenStack Effect Schema';
export const description = 'Generate Effect Schemas from ZenStack';

const run = (model: Model, options: PluginOptions, dmmf: DMMF.Document) => Effect.gen(function* () {
    const generator = yield* Generator.Generator;
    const isDisabled = yield* Config.boolean("DISABLE_ZENSTACK_EFFECT").pipe(Config.withDefault(false)) // todo! include options.disable
    if (isDisabled) { return }

    const outputFolder = resolvePath((options.output as string) ?? 'effect', options);
    yield* generator.run(model, outputFolder);
}).pipe(
    Effect.provide(Generator.layer),
    Effect.provide(NodeContext.layer),
    NodeRuntime.runMain
)

export default run
