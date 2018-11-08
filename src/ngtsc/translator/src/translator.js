"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const compiler_1 = require("@angular/compiler");
const ts = require("typescript");
const path_1 = require("../../util/src/path");
class Context {
    constructor(isStatement) {
        this.isStatement = isStatement;
    }
    get withExpressionMode() { return this.isStatement ? new Context(false) : this; }
    get withStatementMode() { return this.isStatement ? new Context(true) : this; }
}
exports.Context = Context;
const BINARY_OPERATORS = new Map([
    [compiler_1.BinaryOperator.And, ts.SyntaxKind.AmpersandAmpersandToken],
    [compiler_1.BinaryOperator.Bigger, ts.SyntaxKind.GreaterThanToken],
    [compiler_1.BinaryOperator.BiggerEquals, ts.SyntaxKind.GreaterThanEqualsToken],
    [compiler_1.BinaryOperator.BitwiseAnd, ts.SyntaxKind.AmpersandToken],
    [compiler_1.BinaryOperator.Divide, ts.SyntaxKind.SlashToken],
    [compiler_1.BinaryOperator.Equals, ts.SyntaxKind.EqualsEqualsToken],
    [compiler_1.BinaryOperator.Identical, ts.SyntaxKind.EqualsEqualsEqualsToken],
    [compiler_1.BinaryOperator.Lower, ts.SyntaxKind.LessThanToken],
    [compiler_1.BinaryOperator.LowerEquals, ts.SyntaxKind.LessThanEqualsToken],
    [compiler_1.BinaryOperator.Minus, ts.SyntaxKind.MinusToken],
    [compiler_1.BinaryOperator.Modulo, ts.SyntaxKind.PercentToken],
    [compiler_1.BinaryOperator.Multiply, ts.SyntaxKind.AsteriskToken],
    [compiler_1.BinaryOperator.NotEquals, ts.SyntaxKind.ExclamationEqualsToken],
    [compiler_1.BinaryOperator.NotIdentical, ts.SyntaxKind.ExclamationEqualsEqualsToken],
    [compiler_1.BinaryOperator.Or, ts.SyntaxKind.BarBarToken],
    [compiler_1.BinaryOperator.Plus, ts.SyntaxKind.PlusToken],
]);
const CORE_SUPPORTED_SYMBOLS = new Set([
    'defineInjectable',
    'defineInjector',
    'ɵdefineNgModule',
    'inject',
    'ɵsetClassMetadata',
    'ɵInjectableDef',
    'ɵInjectorDef',
    'ɵNgModuleDefWithMeta',
    'ɵNgModuleFactory',
]);
class ImportManager {
    constructor(isCore, prefix = 'i') {
        this.isCore = isCore;
        this.prefix = prefix;
        this.moduleToIndex = new Map();
        this.nextIndex = 0;
    }
    generateNamedImport(moduleName, symbol) {
        if (!this.moduleToIndex.has(moduleName)) {
            this.moduleToIndex.set(moduleName, `${this.prefix}${this.nextIndex++}`);
        }
        if (this.isCore && moduleName === '@angular/core' && !CORE_SUPPORTED_SYMBOLS.has(symbol)) {
            throw new Error(`Importing unexpected symbol ${symbol} while compiling core`);
        }
        return this.moduleToIndex.get(moduleName);
    }
    getAllImports(contextPath, rewriteCoreImportsTo) {
        return Array.from(this.moduleToIndex.keys()).map(name => {
            const as = this.moduleToIndex.get(name);
            if (rewriteCoreImportsTo !== null && name === '@angular/core') {
                const relative = path_1.relativePathBetween(contextPath, rewriteCoreImportsTo.fileName);
                if (relative === null) {
                    throw new Error(`Failed to rewrite import inside core: ${contextPath} -> ${rewriteCoreImportsTo.fileName}`);
                }
                name = relative;
            }
            return { name, as };
        });
    }
}
exports.ImportManager = ImportManager;
function translateExpression(expression, imports) {
    return expression.visitExpression(new ExpressionTranslatorVisitor(imports), new Context(false));
}
exports.translateExpression = translateExpression;
function translateStatement(statement, imports) {
    return statement.visitStatement(new ExpressionTranslatorVisitor(imports), new Context(true));
}
exports.translateStatement = translateStatement;
function translateType(type, imports) {
    return type.visitType(new TypeTranslatorVisitor(imports), new Context(false));
}
exports.translateType = translateType;
class ExpressionTranslatorVisitor {
    constructor(imports) {
        this.imports = imports;
    }
    visitDeclareVarStmt(stmt, context) {
        const nodeFlags = stmt.hasModifier(compiler_1.StmtModifier.Final) ? ts.NodeFlags.Const : ts.NodeFlags.None;
        return ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(stmt.name, undefined, stmt.value &&
                stmt.value.visitExpression(this, context.withExpressionMode))], nodeFlags));
    }
    visitDeclareFunctionStmt(stmt, context) {
        return ts.createFunctionDeclaration(undefined, undefined, undefined, stmt.name, undefined, stmt.params.map(param => ts.createParameter(undefined, undefined, undefined, param.name)), undefined, ts.createBlock(stmt.statements.map(child => child.visitStatement(this, context.withStatementMode))));
    }
    visitExpressionStmt(stmt, context) {
        return ts.createStatement(stmt.expr.visitExpression(this, context.withStatementMode));
    }
    visitReturnStmt(stmt, context) {
        return ts.createReturn(stmt.value.visitExpression(this, context.withExpressionMode));
    }
    visitDeclareClassStmt(stmt, context) {
        throw new Error('Method not implemented.');
    }
    visitIfStmt(stmt, context) {
        return ts.createIf(stmt.condition.visitExpression(this, context), ts.createBlock(stmt.trueCase.map(child => child.visitStatement(this, context.withStatementMode))), stmt.falseCase.length > 0 ?
            ts.createBlock(stmt.falseCase.map(child => child.visitStatement(this, context.withStatementMode))) :
            undefined);
    }
    visitTryCatchStmt(stmt, context) {
        throw new Error('Method not implemented.');
    }
    visitThrowStmt(stmt, context) { throw new Error('Method not implemented.'); }
    visitCommentStmt(stmt, context) {
        throw new Error('Method not implemented.');
    }
    visitJSDocCommentStmt(stmt, context) {
        const commentStmt = ts.createNotEmittedStatement(ts.createLiteral(''));
        const text = stmt.toString();
        const kind = ts.SyntaxKind.MultiLineCommentTrivia;
        ts.setSyntheticLeadingComments(commentStmt, [{ kind, text, pos: -1, end: -1 }]);
        return commentStmt;
    }
    visitReadVarExpr(ast, context) {
        return ts.createIdentifier(ast.name);
    }
    visitWriteVarExpr(expr, context) {
        const result = ts.createBinary(ts.createIdentifier(expr.name), ts.SyntaxKind.EqualsToken, expr.value.visitExpression(this, context));
        return context.isStatement ? result : ts.createParen(result);
    }
    visitWriteKeyExpr(expr, context) {
        throw new Error('Method not implemented.');
    }
    visitWritePropExpr(expr, context) {
        return ts.createBinary(ts.createPropertyAccess(expr.receiver.visitExpression(this, context), expr.name), ts.SyntaxKind.EqualsToken, expr.value.visitExpression(this, context));
    }
    visitInvokeMethodExpr(ast, context) {
        const target = ast.receiver.visitExpression(this, context);
        return ts.createCall(ast.name !== null ? ts.createPropertyAccess(target, ast.name) : target, undefined, ast.args.map(arg => arg.visitExpression(this, context)));
    }
    visitInvokeFunctionExpr(ast, context) {
        const expr = ts.createCall(ast.fn.visitExpression(this, context), undefined, ast.args.map(arg => arg.visitExpression(this, context)));
        if (ast.pure) {
            ts.addSyntheticLeadingComment(expr, ts.SyntaxKind.MultiLineCommentTrivia, '@__PURE__', false);
        }
        return expr;
    }
    visitInstantiateExpr(ast, context) {
        return ts.createNew(ast.classExpr.visitExpression(this, context), undefined, ast.args.map(arg => arg.visitExpression(this, context)));
    }
    visitLiteralExpr(ast, context) {
        if (ast.value === undefined) {
            return ts.createIdentifier('undefined');
        }
        else if (ast.value === null) {
            return ts.createNull();
        }
        else {
            return ts.createLiteral(ast.value);
        }
    }
    visitExternalExpr(ast, context) {
        if (ast.value.moduleName === null || ast.value.name === null) {
            throw new Error(`Import unknown module or symbol ${ast.value}`);
        }
        const importIdentifier = this.imports.generateNamedImport(ast.value.moduleName, ast.value.name);
        if (importIdentifier === null) {
            return ts.createIdentifier(ast.value.name);
        }
        else {
            return ts.createPropertyAccess(ts.createIdentifier(importIdentifier), ts.createIdentifier(ast.value.name));
        }
    }
    visitConditionalExpr(ast, context) {
        return ts.createParen(ts.createConditional(ast.condition.visitExpression(this, context), ast.trueCase.visitExpression(this, context), ast.falseCase.visitExpression(this, context)));
    }
    visitNotExpr(ast, context) {
        return ts.createPrefix(ts.SyntaxKind.ExclamationToken, ast.condition.visitExpression(this, context));
    }
    visitAssertNotNullExpr(ast, context) {
        return ts.createNonNullExpression(ast.condition.visitExpression(this, context));
    }
    visitCastExpr(ast, context) {
        return ast.value.visitExpression(this, context);
    }
    visitFunctionExpr(ast, context) {
        return ts.createFunctionExpression(undefined, undefined, ast.name || undefined, undefined, ast.params.map(param => ts.createParameter(undefined, undefined, undefined, param.name, undefined, undefined, undefined)), undefined, ts.createBlock(ast.statements.map(stmt => stmt.visitStatement(this, context))));
    }
    visitBinaryOperatorExpr(ast, context) {
        if (!BINARY_OPERATORS.has(ast.operator)) {
            throw new Error(`Unknown binary operator: ${compiler_1.BinaryOperator[ast.operator]}`);
        }
        const binEx = ts.createBinary(ast.lhs.visitExpression(this, context), BINARY_OPERATORS.get(ast.operator), ast.rhs.visitExpression(this, context));
        return ast.parens ? ts.createParen(binEx) : binEx;
    }
    visitReadPropExpr(ast, context) {
        return ts.createPropertyAccess(ast.receiver.visitExpression(this, context), ast.name);
    }
    visitReadKeyExpr(ast, context) {
        return ts.createElementAccess(ast.receiver.visitExpression(this, context), ast.index.visitExpression(this, context));
    }
    visitLiteralArrayExpr(ast, context) {
        return ts.createArrayLiteral(ast.entries.map(expr => expr.visitExpression(this, context)));
    }
    visitLiteralMapExpr(ast, context) {
        const entries = ast.entries.map(entry => ts.createPropertyAssignment(entry.quoted ? ts.createLiteral(entry.key) : ts.createIdentifier(entry.key), entry.value.visitExpression(this, context)));
        return ts.createObjectLiteral(entries);
    }
    visitCommaExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitWrappedNodeExpr(ast, context) { return ast.node; }
    visitTypeofExpr(ast, context) {
        return ts.createTypeOf(ast.expr.visitExpression(this, context));
    }
}
class TypeTranslatorVisitor {
    constructor(imports) {
        this.imports = imports;
    }
    visitBuiltinType(type, context) {
        switch (type.name) {
            case compiler_1.BuiltinTypeName.Bool:
                return 'boolean';
            case compiler_1.BuiltinTypeName.Dynamic:
                return 'any';
            case compiler_1.BuiltinTypeName.Int:
            case compiler_1.BuiltinTypeName.Number:
                return 'number';
            case compiler_1.BuiltinTypeName.String:
                return 'string';
            case compiler_1.BuiltinTypeName.None:
                return 'never';
            default:
                throw new Error(`Unsupported builtin type: ${compiler_1.BuiltinTypeName[type.name]}`);
        }
    }
    visitExpressionType(type, context) {
        const exprStr = type.value.visitExpression(this, context);
        if (type.typeParams !== null) {
            const typeSegments = type.typeParams.map(param => param.visitType(this, context));
            return `${exprStr}<${typeSegments.join(', ')}>`;
        }
        else {
            return exprStr;
        }
    }
    visitArrayType(type, context) {
        return `Array<${type.visitType(this, context)}>`;
    }
    visitMapType(type, context) {
        if (type.valueType !== null) {
            return `{[key: string]: ${type.valueType.visitType(this, context)}}`;
        }
        else {
            return '{[key: string]: any}';
        }
    }
    visitReadVarExpr(ast, context) {
        if (ast.name === null) {
            throw new Error(`ReadVarExpr with no variable name in type`);
        }
        return ast.name;
    }
    visitWriteVarExpr(expr, context) {
        throw new Error('Method not implemented.');
    }
    visitWriteKeyExpr(expr, context) {
        throw new Error('Method not implemented.');
    }
    visitWritePropExpr(expr, context) {
        throw new Error('Method not implemented.');
    }
    visitInvokeMethodExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitInvokeFunctionExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitInstantiateExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitLiteralExpr(ast, context) {
        if (typeof ast.value === 'string') {
            const escaped = ast.value.replace(/\'/g, '\\\'');
            return `'${escaped}'`;
        }
        else {
            return `${ast.value}`;
        }
    }
    visitExternalExpr(ast, context) {
        if (ast.value.moduleName === null || ast.value.name === null) {
            throw new Error(`Import unknown module or symbol`);
        }
        const moduleSymbol = this.imports.generateNamedImport(ast.value.moduleName, ast.value.name);
        const base = `${moduleSymbol}.${ast.value.name}`;
        if (ast.typeParams !== null) {
            const generics = ast.typeParams.map(type => type.visitType(this, context)).join(', ');
            return `${base}<${generics}>`;
        }
        else {
            return base;
        }
    }
    visitConditionalExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitNotExpr(ast, context) { throw new Error('Method not implemented.'); }
    visitAssertNotNullExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitCastExpr(ast, context) { throw new Error('Method not implemented.'); }
    visitFunctionExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitBinaryOperatorExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitReadPropExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitReadKeyExpr(ast, context) {
        throw new Error('Method not implemented.');
    }
    visitLiteralArrayExpr(ast, context) {
        const values = ast.entries.map(expr => expr.visitExpression(this, context));
        return `[${values.join(', ')}]`;
    }
    visitLiteralMapExpr(ast, context) {
        const entries = ast.entries.map(entry => {
            const { key, quoted } = entry;
            const value = entry.value.visitExpression(this, context);
            if (quoted) {
                return `'${key}': ${value}`;
            }
            else {
                return `${key}: ${value}`;
            }
        });
        return `{${entries.join(', ')}}`;
    }
    visitCommaExpr(ast, context) { throw new Error('Method not implemented.'); }
    visitWrappedNodeExpr(ast, context) {
        const node = ast.node;
        if (ts.isIdentifier(node)) {
            return node.text;
        }
        else {
            throw new Error(`Unsupported WrappedNodeExpr in TypeTranslatorVisitor: ${ts.SyntaxKind[node.kind]}`);
        }
    }
    visitTypeofExpr(ast, context) {
        return `typeof ${ast.expr.visitExpression(this, context)}`;
    }
}
exports.TypeTranslatorVisitor = TypeTranslatorVisitor;
//# sourceMappingURL=translator.js.map