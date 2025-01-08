import ts, { factory } from "typescript";

import type {
	BuiltinType,
	DataModel,
	DataModelField,
} from "@zenstackhq/sdk/ast";
import { Match } from "effect";

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

/**
 * Generates a TypeScript AST for a `BuiltinType`. Returns a `ts.PropertyAccessExpression`.
 */
export const builtInTypeAst = (type: BuiltinType | undefined) =>
	factory.createPropertyAccessExpression(
		factory.createIdentifier("Schema"),
		Match.value(type).pipe(
			Match.when("BigInt", () => factory.createIdentifier("BigInt")),
			Match.when("Boolean", () => factory.createIdentifier("Boolean")),
			Match.when("Int", () => factory.createIdentifier("Int")),
			Match.when("Float", () => factory.createIdentifier("Number")),
			Match.when("String", () => factory.createIdentifier("String")),
			Match.when("Json", () => factory.createIdentifier("Object")),
			Match.when("Decimal", () => factory.createIdentifier("Number")),
			Match.when("Bytes", () => factory.createIdentifier("Uint8Array")),
			Match.when("DateTime", () => factory.createIdentifier("DateTimeUtc")),
			Match.orElse(() => factory.createIdentifier("Unknown")),
		),
	);

/**
 * Generates a TypeScript AST for a `DataModelField`. Returns a `ts.PropertyAssignment`.
 */
export const fieldAst = (field: DataModelField) => {
	const type = field.type

	let fieldAst: ts.Expression = builtInTypeAst(type.type)

	if (type.array) {
		fieldAst = factory.createCallExpression(
			factory.createPropertyAccessExpression(
				factory.createIdentifier("Schema"),
				factory.createIdentifier("Array")
			),
			undefined,
			[fieldAst]
		)
	}
	if (type.optional) {
		fieldAst = factory.createCallExpression(
			factory.createPropertyAccessExpression(
				fieldAst,
				factory.createIdentifier("pipe")
			),
			undefined,
			[factory.createPropertyAccessExpression(
				factory.createIdentifier("Schema"),
				factory.createIdentifier("optional")
			)])	
	}


	return factory.createPropertyAssignment(
		factory.createIdentifier(field.name),
		fieldAst,
	);
};

/**
 * Generates a TypeScript AST for a `Schema` from a DataModel
 */
export const modelAst = (
	model: DataModel,
	options: { export?: boolean } = {},
) =>
	factory.createClassDeclaration(
		options.export ? [factory.createToken(ts.SyntaxKind.ExportKeyword)] : [],
		factory.createIdentifier(model.name),
		undefined,
		[
			factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
				factory.createExpressionWithTypeArguments(
					factory.createCallExpression(
						factory.createCallExpression(
							factory.createPropertyAccessExpression(
								factory.createIdentifier("Schema"),
								factory.createIdentifier("TaggedClass"),
							),
							[
								factory.createTypeReferenceNode(
									factory.createIdentifier(model.name),
									undefined,
								),
							],
							[],
						),
						undefined,
						[
							factory.createStringLiteral(model.name),
							factory.createObjectLiteralExpression(
								model.fields.map((field) => fieldAst(field)),
								true,
							),
						],
					),
					undefined,
				),
			]),
		],
		[],
	);
