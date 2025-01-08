import type { DMMF } from '@prisma/generator-helper';
import { PluginOptions } from '@zenstackhq/sdk';
import { isDataModel, Model } from '@zenstackhq/sdk/ast';
import { config } from 'dotenv';
import { astToString, modelAst } from "./Ast";

config();

export const name = 'ZenStack Effect Schema';
export const description = 'Generate Effect Schemas from ZenStack';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function run(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    if (process.env.DISABLE_ZENSTACK_EFFECT === 'true' || options.disable) {
        return;
    }

    const dataModels = model.declarations.filter(isDataModel);

    // const outFolder = resolvePath((options.output as string) ?? './effect', options);
    const ast = modelAst(dataModels[0]);
    console.log(astToString(ast))
}
