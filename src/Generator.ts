import type {
	BuiltinType,
	DataModel,
	DataModelField,
} from "@zenstackhq/sdk/ast";
import { Match } from "effect";
import ts, { factory } from "typescript";

/**
 * Generates a TypeScript AST for a `BuiltinType`. Returns a `ts.PropertyAccessExpression`.
 */
export const builtInTypeAst = (type: BuiltinType) =>
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
			Match.exhaustive,
		),
	);

/**
 * Generates a TypeScript AST for a `DataModelField`. Returns a `ts.PropertyAssignment`.
 */
export const fieldAst = (field: DataModelField) => {
	const value = factory.createPropertyAccessExpression(
		factory.createIdentifier("Schema"),
		factory.createIdentifier("String"),
	);

	return factory.createPropertyAssignment(
		factory.createIdentifier(field.name),
		value,
	);
};

/**
 * Generates a TypeScript AST for a `Schema` from a DataModel
 */
export const schemaAstFromModel = (
	model: Partial<DataModel> & Pick<DataModel, "name" | "fields">,
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
