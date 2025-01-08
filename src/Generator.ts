import { FileSystem, Path } from "@effect/platform";
import { isDataModel, isEnum, Model } from "@zenstackhq/sdk/ast";
import { Effect } from "effect";
import * as Ast from "./Ast";

export const runCodegen = (model: Model, outputFolder: string) => Effect.gen(function*() {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path
	const dataModels = model.declarations.filter(isDataModel);

	// start fresh
	if(yield* fs.exists(outputFolder)) {
		yield* fs.remove(outputFolder, { recursive: true });
	}

	// models ------------------------------

	const modelsDirPath = path.join(outputFolder, "models");
	yield* fs.makeDirectory(modelsDirPath, { recursive: true });

	yield* Effect.forEach(dataModels, dataModel => Effect.gen(function* () {
		const filePath = path.join(modelsDirPath, dataModel.name + ".ts");
		yield* fs.writeFileString(filePath, Ast.astToString([
			Ast.schemaImportAst,
			Ast.modelAst(dataModel, { export: true })
		]));
	}), { concurrency: "unbounded" })

	// enums ------------------------------

	const enums = model.declarations.filter(isEnum);
	const enumsDirPath = path.join(outputFolder, "enums");
	yield* fs.makeDirectory(enumsDirPath, { recursive: true });

	yield* Effect.forEach(enums, enum_ => Effect.gen(function* () {
		const filePath = path.join(enumsDirPath, enum_.name + ".ts");
		yield* fs.writeFileString(filePath, Ast.astToString([
			Ast.schemaImportAst,
			Ast.enumAst(enum_)
		]));
	}), { concurrency: "unbounded" })
})
