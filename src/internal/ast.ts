import ts, { factory } from "typescript";

/**
 * Convert an AST to a string
 * @internal
 */
export const astToString = (
	nodes: ts.Node | ts.Node[],
	printerOptions?: ts.PrinterOptions,
) => {
	const sourceFile = ts.createSourceFile(
		"print.ts",
		"",
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);
	const printer = ts.createPrinter(printerOptions);

	const output = printer.printList(
		ts.ListFormat.MultiLine,
		ts.factory.createNodeArray(Array.isArray(nodes) ? nodes : [nodes]),
		sourceFile,
	);

	return output;
};

/**
 * Import declaration for `import { Schema } from "effect"`
 * @internal
 */
export const schemaImportAst = factory.createImportDeclaration(
	undefined,
	factory.createImportClause(
		false,
		undefined,
		factory.createNamedImports([
			factory.createImportSpecifier(
				false,
				undefined,
				factory.createIdentifier("Schema"),
			),
		]),
	),
	factory.createStringLiteral("effect"),
	undefined,
);
