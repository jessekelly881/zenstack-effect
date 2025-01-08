import { NodeRuntime } from "@effect/platform-node";
import type { DMMF } from '@prisma/generator-helper';
import { PluginOptions } from '@zenstackhq/sdk';
import { isDataModel, Model } from '@zenstackhq/sdk/ast';
import { config } from 'dotenv';
import { Config, Effect } from "effect";
import { astToString, modelAst } from "./Ast";

config();

export const name = 'ZenStack Effect Schema';
export const description = 'Generate Effect Schemas from ZenStack';

const run = (model: Model, options: PluginOptions, dmmf: DMMF.Document) => Effect.gen(function*() {
    const isDisabled = yield* Config.boolean("DISABLE_ZENSTACK_EFFECT").pipe(Config.withDefault(false))
    if(isDisabled) {
        return
    }

    const dataModels = model.declarations.filter(isDataModel);

    const ast = modelAst(dataModels[0]);
    console.log(`model: ${astToString(ast)}`)

}).pipe(NodeRuntime.runMain)

export default run
