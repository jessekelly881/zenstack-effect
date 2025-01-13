import { Path } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import type { DMMF } from '@prisma/generator-helper';
import { DEFAULT_RUNTIME_LOAD_PATH } from "@zenstackhq/runtime";
import { PluginGlobalOptions, PluginOptions } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { config } from 'dotenv';
import { Config, Effect, Logger, LogLevel } from "effect";
import * as fs from "node:fs";
import path from "path";
import * as Generator from "./Generator";

config();

export const name = 'ZenStack Effect Schema';
export const description = 'Generate Effect Schemas from ZenStack';

export function getNodeModulesFolder(startPath?: string): string | undefined {
    startPath = startPath ?? process.cwd();
    if (startPath.endsWith('node_modules')) {
        return startPath;
    } else if (fs.existsSync(path.join(startPath, 'node_modules'))) {
        return path.join(startPath, 'node_modules');
    } else if (startPath !== '/') {
        const parent = path.join(startPath, '..');
        return getNodeModulesFolder(parent);
    } else {
        return undefined;
    }
}

/**
 * Gets the default node_modules/.zenstack output folder for plugins.
 * @returns
 */
export function getDefaultOutputFolder(globalOptions?: PluginGlobalOptions) {
    if (typeof globalOptions?.output === 'string') {
        return path.resolve(globalOptions.output);
    }

    // for testing, use the local node_modules
    if (process.env.ZENSTACK_TEST === '1') {
        return path.join(process.cwd(), 'node_modules', DEFAULT_RUNTIME_LOAD_PATH);
    }

    // find the real runtime module path, it might be a symlink in pnpm
    let runtimeModulePath = require.resolve('@zenstackhq/runtime');

    // start with the parent folder of @zenstackhq, supposed to be a node_modules folder
    while (!runtimeModulePath.endsWith('@zenstackhq') && runtimeModulePath !== '/') {
        runtimeModulePath = path.join(runtimeModulePath, '..');
    }
    runtimeModulePath = path.join(runtimeModulePath, '..');

    const modulesFolder = getNodeModulesFolder(runtimeModulePath);
    return modulesFolder ? path.join(modulesFolder, DEFAULT_RUNTIME_LOAD_PATH) : undefined;
}

const run = (model: Model, options: PluginOptions, dmmf: DMMF.Document, globalOptions: PluginGlobalOptions) => Effect.gen(function* () {
    const path = yield* Path.Path;
    const generator = yield* Generator.Generator;
    const isDisabled = yield* Config.boolean("DISABLE_ZENSTACK_EFFECT").pipe(Config.withDefault(false)) // todo! include options.disable
    if (isDisabled) { return }

    let output = options.output as string;
    if (!output) {
        const defaultOutputFolder = getDefaultOutputFolder(globalOptions);
        if (defaultOutputFolder) {
            output = path.join(defaultOutputFolder, 'effect');
        } else {
            output = './generated/effect';
        }
    }

    yield* generator.run(model, output);

}).pipe(
    Effect.provide(Generator.layer),
    Effect.provide(NodeContext.layer),
    Logger.withMinimumLogLevel((options.debug as boolean) ? LogLevel.Debug : LogLevel.Info),
    NodeRuntime.runMain
)

export default run
