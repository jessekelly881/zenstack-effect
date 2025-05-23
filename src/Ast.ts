import ts, { factory } from "typescript";

import { getLiteral } from "@zenstackhq/sdk";
import {
	DataModelFieldAttribute,
	Enum,
	isEnum,
	isTypeDef,
	TypeDef,
	TypeDefField,
	type BuiltinType,
	type DataModel,
	type DataModelField
} from "@zenstackhq/sdk/ast";
import { Array as Arr, Effect, HashSet, Match, Option, Order, Ref, Schema } from "effect";
import { isNonEmptyReadonlyArray } from "effect/Array";

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
 * Import declaration for `import { Schema } from "effect"`
 */
export const commonImportsAst = (imports: string[]) => factory.createImportDeclaration(
	undefined,
	factory.createImportClause(
		false,
		undefined,
		factory.createNamedImports(imports.map(name =>
			factory.createImportSpecifier(
				false,
				undefined,
				factory.createIdentifier(name),
			),
		)),
	),
	factory.createStringLiteral("../common"),
	undefined,
);

/**
 * Generates a TypeScript AST for a `BuiltinType`. Returns a `ts.PropertyAccessExpression`.
 * `Decimal` and `Bytes` must be handle seperately. 
 */
export const builtInTypeAst = (type: Exclude<BuiltinType, "Decimal" | "Bytes">) =>
	factory.createPropertyAccessExpression(
		factory.createIdentifier("Schema"),
		Match.value(type).pipe(
			Match.when("BigInt", () => factory.createIdentifier("BigInt")),
			Match.when("Boolean", () => factory.createIdentifier("Boolean")),
			Match.when("Int", () => factory.createIdentifier("Int")),
			Match.when("Float", () => factory.createIdentifier("Number")),
			Match.when("String", () => factory.createIdentifier("String")),
			Match.when("Json", () => factory.createIdentifier("Object")),
			Match.when("DateTime", () => factory.createIdentifier("DateTimeUtc")),
			Match.exhaustive
		),
	);

/** 
 * @internal 
 * @see https://github.com/zenstackhq/zenstack/blob/4b7d813624b4e73fcf8fd14d2849d5b1aef6aae3/packages/schema/src/plugins/zod/utils/schema-gen.ts#L211
 */
function getAttrLiteralArg<T extends string | number>(attr: DataModelFieldAttribute, paramName: string) {
	const arg = attr.args.find((arg) => arg.$resolvedParam?.name === paramName);
	return arg && getLiteral<T>(arg.value);
}

/** @internal */
class SchemaModifier {
	name: keyof typeof Schema;
	ast: ts.Expression;
}

/** 
 * `Schema.Schema<string, string>` modifiers.
 * @internal 
 */
const stringModifiers: (keyof typeof Schema)[] = ["Trim", "Lowercase", "Uppercase", "Capitalize", "length", "minLength", "maxLength"]

/**
 * Modifiers that transform a string into a different type.
 * @internal
 */
const stringTransforms: (keyof typeof Schema)[] = ["URL"]

/** 
 * Order of transforms and filters in Schema.pipe(...) expression.
 * @internal
 */
const schemaModifierOrder = Order.make<SchemaModifier>((self, that) => {
	// String modifiers(i.e. string -> string) should go before string transforms(e.g. string -> number)

	if (stringModifiers.includes(self.name) && stringTransforms.includes(that.name)) {
		return -1
	}

	if (stringTransforms.includes(self.name) && stringModifiers.includes(that.name)) {
		return 1
	}

	return 0
})

/**
 * Given a `DataModelFieldAttribute`, returns an appropriate `Schema` modifier. E.g. `Schema.startsWith("str")` or `Schema.compose(Schema.UUID)`
 */
const fieldAttributeModifier = (attr: DataModelFieldAttribute, fieldType?: BuiltinType): Option.Option<SchemaModifier> => {
	const message = getAttrLiteralArg<string>(attr, 'message');
	const messageAst = message ? factory.createObjectLiteralExpression(
		[factory.createPropertyAssignment(
			factory.createIdentifier("message"),
			factory.createStringLiteral(message)
		)],
		false
	) : undefined;

	let filter: SchemaModifier | undefined = undefined;

	/**
	 * Ast that produces: `Schema._filterName_(text, { message })`
	 */
	const schemaFilterAst = (filterName: keyof typeof Schema, args: ts.Expression[]) => factory.createCallExpression(
		factory.createPropertyAccessExpression(
			factory.createIdentifier("Schema"),
			factory.createIdentifier(filterName)
		),
		undefined,
		[
			...args,
			...(messageAst ? [messageAst] : [])
		]
	)

	/**
	 * Ast that produces: `Schema.compose(Schema._schemaName_)`. E.g. `Schema.compose(Schema.UUID)`
	 */
	const composeWithAst = (schemaName: string) => factory.createCallExpression(
		factory.createPropertyAccessExpression(
			factory.createIdentifier("Schema"),
			factory.createIdentifier("compose")
		),
		undefined,
		[factory.createPropertyAccessExpression(
			factory.createIdentifier("Schema"),
			factory.createIdentifier(schemaName)
		)]
	)

	switch (attr.decl.ref?.name) {
		case '@length': {
			if (fieldType === "String") {
				const min = getAttrLiteralArg<number>(attr, 'min');
				const max = getAttrLiteralArg<number>(attr, 'max');

				if (min && max) {
					filter = {
						name: "length", ast: schemaFilterAst("length",
							[factory.createObjectLiteralExpression(
								[factory.createPropertyAssignment(
									factory.createIdentifier("min"),
									factory.createNumericLiteral(min)
								),
								factory.createPropertyAssignment(
									factory.createIdentifier("max"),
									factory.createNumericLiteral(max)
								)
								],
								false
							)]
						)
					};
				}

				else if (min) {
					filter = { name: "minLength", ast: schemaFilterAst("minLength", [factory.createNumericLiteral(min)]) };
				}
				else if (max) {
					filter = { name: "maxLength", ast: schemaFilterAst("maxLength", [factory.createNumericLiteral(max)]) };
				}
			}
			break;
		}
		case '@contains': {
			const text = getAttrLiteralArg<string>(attr, 'text');
			if (text) {
				filter = { name: "includes", ast: schemaFilterAst("includes", [factory.createStringLiteral(text)]) };
			}
			break;
		}

		case '@regex': {
			const expr = getAttrLiteralArg<string>(attr, 'regex');
			if (expr) {
				filter = { name: "pattern", ast: schemaFilterAst("pattern", [factory.createRegularExpressionLiteral(`/${expr}/`)]) };
			}
			break;
		}

		case '@startsWith': {
			const text = getAttrLiteralArg<string>(attr, 'text');
			if (text) {
				filter = { name: "startsWith", ast: schemaFilterAst("startsWith", [factory.createStringLiteral(text)]) };
			}
			break;
		}

		case '@endsWith': {
			const text = getAttrLiteralArg<string>(attr, 'text');
			if (text) {
				filter = { name: "endsWith", ast: schemaFilterAst("endsWith", [factory.createStringLiteral(text)]) };
			}
			break;
		}

		case '@gt': {
			const value = getAttrLiteralArg<number>(attr, 'value');
			if (value !== undefined) {
				filter = { name: "greaterThan", ast: schemaFilterAst("greaterThan", [factory.createNumericLiteral(value)]) };
			}
			break;
		}

		case '@gte': {
			const value = getAttrLiteralArg<number>(attr, 'value');
			if (value !== undefined) {
				filter = { name: "greaterThanOrEqualTo", ast: schemaFilterAst("greaterThanOrEqualTo", [factory.createNumericLiteral(value)]) };
			}
			break;
		}

		case '@lt': {
			const value = getAttrLiteralArg<number>(attr, 'value');
			if (value !== undefined) {
				filter = { name: "lessThan", ast: schemaFilterAst("lessThan", [factory.createNumericLiteral(value)]) };
			}
			break;
		}

		case '@lte': {
			const value = getAttrLiteralArg<number>(attr, 'value');
			if (value !== undefined) {
				filter = { name: "lessThanOrEqualTo", ast: schemaFilterAst("lessThanOrEqualTo", [factory.createNumericLiteral(value)]) };
			}
			break;
		}

		case '@url': {
			filter = { name: "URL", ast: composeWithAst("URL") };
			break;
		}

		case '@trim': {
			filter = { name: "Trim", ast: composeWithAst("Trim") };
			break;
		}

		case '@lower': {
			filter = { name: "Lowercase", ast: composeWithAst("Lowercase") };
			break;
		}

		case '@upper': {
			filter = { name: "Uppercase", ast: composeWithAst("Uppercase") };
			break;
		}

		case '@db.Uuid': {
			filter = { name: "UUID", ast: composeWithAst("UUID") };
			break;
		}

	}

	return Option.fromNullable(filter);
}

/**
 * Order of field names in a `DataModel` or `TypeDef`.
 * @internal
 */
const fieldNameOrder = Order.mapInput(Order.string, (f: DataModelField | TypeDefField) => f.name)

/**
 * Generates a TypeScript AST for a `DataModelField`. Returns a `ts.PropertyAssignment`.
 */
export const fieldAst = (field: DataModelField | TypeDefField) => Effect.gen(function* () {
	const importSet = yield* ImportSet;
	const type = field.type

	let fieldAst: ts.Expression;

	if (type.type) {
		if (type.type === "Decimal") {
			yield* importSet.addImport({ "type": "common", name: "Decimal" })
			fieldAst = factory.createIdentifier("Decimal")
		}

		else if (type.type === "Bytes") {
			yield* importSet.addImport({ "type": "common", name: "Bytes" })
			fieldAst = factory.createIdentifier("Bytes")
		}

		else {
			fieldAst = builtInTypeAst(type.type)
		}
	}

	else if (field.type.reference?.ref) {
		const name = field.type.reference.ref.name;
		if (isEnum(field.type.reference?.ref)) {
			yield* importSet.addImport({ type: "model", name });
			fieldAst = factory.createIdentifier(name);
		}

		else if (isTypeDef(field.type.reference?.ref)) {
			fieldAst = suspendedSchemaAst(field.type.reference.ref.name)
		}

		else {
			yield* Effect.logDebug(`Unknown ref: ${field.type.reference?.ref.name}`);
			fieldAst = unknownSchemaAst;
		}
	}


	else {
		yield* Effect.logDebug(`Unknown field: ${field.name}`);
		fieldAst = unknownSchemaAst
	}

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

	// Schema filters, transforms, etc. Provided to the schema in a .pipe() call. E.g. `.pipe(Schema.optional, Schema.min(4), ...)`
	const schemaModifiers: readonly SchemaModifier[] = [
		...Arr.filterMap(field.attributes, (attr) => fieldAttributeModifier(attr, field.type.type)),
		...(type.optional ? [{
			name: "optional", ast: factory.createPropertyAccessExpression( // optional must be last
				factory.createIdentifier("Schema"),
				factory.createIdentifier("optional")
			)
		} as SchemaModifier] : []),
	]

	// .pipe(...)
	if (isNonEmptyReadonlyArray(schemaModifiers)) {
		fieldAst = factory.createCallExpression(
			factory.createPropertyAccessExpression(
				fieldAst,
				factory.createIdentifier("pipe")
			),
			undefined,
			Arr.sort(schemaModifierOrder)(schemaModifiers).map(modifier => modifier.ast)
		)
	}

	return factory.createPropertyAssignment(
		factory.createIdentifier(field.name),
		fieldAst,
	);
});

/**
 * Generates a TypeScript AST for a `Schema` from a DataModel
 */
export const dataModelAst = (
	model: DataModel | TypeDef,
	options: { export?: boolean } = {},
) => Effect.gen(function* () {
	return factory.createClassDeclaration(
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
							factory.createObjectLiteralExpression(yield* Effect.forEach(Arr.sortBy(fieldNameOrder)(model.fields), field => fieldAst(field)),
								true,
							),
						],
					),
					undefined,
				),
			]),
		],
		[],
	)
});

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

export const modelFileAst = (model: DataModel | TypeDef) => Effect.gen(function* () {
	const importSet = yield* ImportSet;
	const modelAst = yield* dataModelAst(model, { export: true });

	const commonImports = yield* importSet.imports.pipe(
		Effect.map(
			Arr.filterMap(i => i.type === "common" ? Option.some(i.name) : Option.none())
		),
	)

	const modelImports = yield* importSet.imports.pipe(
		Effect.map(
			Arr.filterMap(i => i.type === "model" ? Option.some(
				factory.createImportDeclaration(
					undefined,
					factory.createImportClause(
						false,
						undefined,
						factory.createNamedImports([factory.createImportSpecifier(
							false,
							undefined,
							factory.createIdentifier(i.name)
						)])
					),
					factory.createStringLiteral(`./${i.name}`),
					undefined
				)
			) : Option.none())
		),
	)

	return [
		schemaImportAst,
		...(commonImports.length > 0 ? [commonImportsAst(commonImports)] : []),
		...modelImports,
		modelAst
	]
}).pipe(
	Effect.provide(ImportSet.Default),
)

export const enumFileAst = (enum_: Enum) => [
	schemaImportAst,
	enumAst(enum_)
]

export const barrelFileAst = (models: (DataModel | TypeDef | Enum)[]) => {
	const sortedModels = Arr.sort(models, Order.mapInput(Order.string, (m: typeof models[number]) => m.name))

	return sortedModels.map(model =>
		factory.createExportDeclaration(
			undefined,
			false,
			factory.createNamespaceExport(factory.createIdentifier(model.name)),
			factory.createStringLiteral(`./${model.name}`),
			undefined
		));
}
