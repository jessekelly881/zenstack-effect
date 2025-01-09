import ts, { factory } from "typescript";

import {
	Enum,
	isEnum,
	isTypeDef,
	TypeDef,
	TypeDefField,
	type BuiltinType,
	type DataModel,
	type DataModelField
} from "@zenstackhq/sdk/ast";
import { Effect, HashSet, Match, Ref } from "effect";

/** @internal */
type Import = { type: "model", name: string } | { type: "common", name: string }

/**
 * Tracks what imports are required throughout the ast tree. 
 * E.g. will add { type: "model", name: "Store" } if a field references the Store model.
 */
export class ImportSet extends Effect.Service<ImportSet>()("zenstack-effect/Ast/ImportSet", {
	effect: Effect.gen(function* () {
		const imports = yield* Ref.make(HashSet.make<Import[]>())

		return {
			imports: Ref.get(imports).pipe(Effect.map(hs => Array.from(HashSet.values(hs)))),
			addImport: (i: Import) => Ref.update(imports, HashSet.add(i)),
		}
	})
}) { }


/** 
 * An ast that produces `Schema.Unknown`
 * @internal
 */
const unknownSchemaAst = factory.createPropertyAccessExpression(
	factory.createIdentifier("Schema"),
	factory.createIdentifier("Unknown")
);

/**
 * Given an identifier, e.g. A, returns an ast that produces `Schema.suspend((): Schema.Schema<A> => A)`
 * @internal
 */
const suspendedSchemaAst = (identifier: string) => factory.createCallExpression(
	factory.createPropertyAccessExpression(
		factory.createIdentifier("Schema"),
		factory.createIdentifier("suspend")
	),
	undefined,
	[factory.createArrowFunction(
		undefined,
		undefined,
		[],
		factory.createTypeReferenceNode(
			factory.createQualifiedName(
				factory.createIdentifier("Schema"),
				factory.createIdentifier("Schema")
			),
			[factory.createTypeReferenceNode(
				factory.createIdentifier(identifier),
				undefined
			)]
		),
		factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		factory.createIdentifier(identifier)
	)]
)

/**
 * Convert an AST to a string
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
 * Named imports from the common file.
 * @todo generate this with ts-morph
 * @internal 
 */
const COMMON_FILE_IMPORTS = ["Double"]

/**
 * Import declaration for `import { Schema } from "effect"`
 */
export const commonTypesImportAst = factory.createImportDeclaration(
	undefined,
	factory.createImportClause(
		false,
		undefined,
		factory.createNamedImports(COMMON_FILE_IMPORTS.map(name =>
			factory.createImportSpecifier(
				false,
				undefined,
				factory.createIdentifier(name),
			),
		)),
	),
	factory.createStringLiteral("effect"),
	undefined,
);

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
			Match.exhaustive
		),
	);

/**
 * Generates a TypeScript AST for a `DataModelField`. Returns a `ts.PropertyAssignment`.
 */
export const fieldAst = (field: DataModelField | TypeDefField) => {
	const type = field.type

	let fieldAst: ts.Expression;

	if (field.type.reference?.ref) {
		if (isEnum(field.type.reference?.ref)) {
			fieldAst = factory.createIdentifier(field.type.reference.ref.name);
		}

		else if (isTypeDef(field.type.reference?.ref)) {
			fieldAst = suspendedSchemaAst(field.type.reference.ref.name)
		}

		else { fieldAst = unknownSchemaAst; }
	}

	else if (type.type) { fieldAst = builtInTypeAst(type.type) }
	else { fieldAst = unknownSchemaAst }

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
export const dataModelAst = (
	model: DataModel | TypeDef,
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

export const enumAst = (enum_: Enum) =>
	factory.createVariableStatement(
		[factory.createToken(ts.SyntaxKind.ExportKeyword)],
		factory.createVariableDeclarationList(
			[factory.createVariableDeclaration(
				factory.createIdentifier(enum_.name),
				undefined,
				undefined,
				factory.createCallExpression(
					factory.createPropertyAccessExpression(
						factory.createIdentifier("Schema"),
						factory.createIdentifier("Literal")
					),
					undefined,
					enum_.fields.map(field => factory.createStringLiteral(field.name))
				)
			)],
			ts.NodeFlags.Const
		)
	)
