import { FileSystem, Path } from "@effect/platform";
import { isDataModel, Model } from "@zenstackhq/sdk/ast";
import { Effect } from "effect";
import * as Ast from "./Ast";

export const runCodegen = (model: Model, outputFolder: string) => Effect.gen(function*() {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path
	const dataModels = model.declarations.filter(isDataModel);

	yield* fs.makeDirectory(outputFolder);
	yield* Effect.forEach(dataModels, dataModel => Effect.gen(function* () {
		const filePath = path.join(outputFolder, dataModel.name + ".ts");
		yield* fs.writeFileString(filePath, Ast.astToString([
			Ast.schemaImportAst,
			Ast.modelAst(dataModel, { export: true })
		]));
	}), { concurrency: "unbounded" })
})
