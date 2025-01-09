import { FileSystem, Path } from "@effect/platform";
import { PlatformError } from "@effect/platform/Error";
import { isDataModel, isEnum, isTypeDef, Model } from "@zenstackhq/sdk/ast";
import { Effect, Layer, Predicate } from "effect";
import * as Ast from "./Ast";

export class Generator extends Effect.Tag("Generator")<Generator, {
	readonly run: (model: Model, outputFolder: string) => Effect.Effect<void, PlatformError>
}>() { }

export const layer = Layer.effect(Generator, Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path

	const runCodegen = (model: Model, outputDirectory: string) => Effect.gen(function* () {
		const dataModels = model.declarations.filter(Predicate.or(isDataModel, isTypeDef));
		const enums = model.declarations.filter(isEnum);

		// copy over common folder
		yield* fs.copy(path.join(__dirname, "..", "static"), path.join(outputDirectory, "common"));

		// models ------------------------------

		const modelsDirPath = path.join(outputDirectory, "models");
		yield* fs.makeDirectory(modelsDirPath, { recursive: true });

		yield* Effect.forEach(dataModels, dataModel => Effect.gen(function* () {
			const filePath = path.join(modelsDirPath, dataModel.name + ".ts");
			const ast = yield* Ast.modelFileAst(dataModel);
			yield* fs.writeFileString(filePath, Ast.astToString(ast));
		}), { concurrency: "unbounded" })

		yield* Effect.forEach(enums, enum_ => Effect.gen(function* () {
			const filePath = path.join(modelsDirPath, enum_.name + ".ts");
			yield* fs.writeFileString(filePath, Ast.astToString([
				Ast.schemaImportAst,
				Ast.enumAst(enum_)
			]));
		}), { concurrency: "unbounded" })
	})

	/**
	 * Creates a temporary directory and runs the codegen in that directory. 
	 * Then swaps in the temporary directory to the output folder and removes the temporary directory.
	 * Ensures that the output folder is written to atomically. If codegen fails nothing is written to the output dir.
	 */
	const run = (model: Model, outputDirectoryPath: string) => Effect.gen(function* () {
		const tempDir = yield* fs.makeTempDirectoryScoped()
		yield* runCodegen(model, tempDir);

		yield* fs.copy(tempDir, outputDirectoryPath, { overwrite: true, preserveTimestamps: true })
	}).pipe(Effect.scoped)

	return {
		run
	}
}))
