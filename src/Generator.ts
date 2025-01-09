import { FileSystem, Path } from "@effect/platform";
import { isDataModel, isEnum, isTypeDef, Model } from "@zenstackhq/sdk/ast";
import { Effect, Predicate } from "effect";
import * as Ast from "./Ast";

export const runCodegen = (model: Model, outputFolder: string) => Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path
	const dataModels = model.declarations.filter(Predicate.or(isDataModel, isTypeDef));
	const enums = model.declarations.filter(isEnum);

	// start fresh
	if (yield* fs.exists(outputFolder)) {
		yield* fs.remove(outputFolder, { recursive: true });
	}
	else {
		yield* fs.makeDirectory(outputFolder, { recursive: true });
	}

	// copy over common folder
	yield* fs.copy(path.join(__dirname, "..", "static"), path.join(outputFolder, "common"));

	// models ------------------------------

	const modelsDirPath = path.join(outputFolder, "models");
	yield* fs.makeDirectory(modelsDirPath, { recursive: true });

	yield* Effect.forEach(dataModels, dataModel => Effect.gen(function* () {
		const filePath = path.join(modelsDirPath, dataModel.name + ".ts");
		yield* fs.writeFileString(filePath, Ast.astToString([
			Ast.schemaImportAst,
			Ast.dataModelAst(dataModel, { export: true })
		]));
	}), { concurrency: "unbounded" })

	yield* Effect.forEach(enums, enum_ => Effect.gen(function* () {
		const filePath = path.join(modelsDirPath, enum_.name + ".ts");
		yield* fs.writeFileString(filePath, Ast.astToString([
			Ast.schemaImportAst,
			Ast.enumAst(enum_)
		]));
	}), { concurrency: "unbounded" })
})
