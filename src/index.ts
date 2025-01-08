import type { DMMF } from '@prisma/generator-helper';
import { PluginOptions, resolvePath } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { config } from 'dotenv';

config();

export const name = 'ZenStack Effect Schema';
export const description = 'Generate Effect Schemas from ZenStack';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function run(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    if (process.env.DISABLE_ZENSTACK_MD === 'true' || options.disable) {
        return;
    }

    const outFolder = resolvePath((options.output as string) ?? './effect', options);
    console.log(`Generating Effect Schemas to ${outFolder}`);
}
