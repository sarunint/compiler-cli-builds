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
const diagnostics_1 = require("../../diagnostics");
const host_1 = require("../../host");
const metadata_1 = require("../../metadata");
function getConstructorDependencies(clazz, reflector, isCore) {
    const useType = [];
    let ctorParams = reflector.getConstructorParameters(clazz);
    if (ctorParams === null) {
        if (reflector.hasBaseClass(clazz)) {
            return null;
        }
        else {
            ctorParams = [];
        }
    }
    ctorParams.forEach((param, idx) => {
        let tokenExpr = param.type;
        let optional = false, self = false, skipSelf = false, host = false;
        let resolved = compiler_1.R3ResolvedDependencyType.Token;
        (param.decorators || []).filter(dec => isCore || isAngularCore(dec)).forEach(dec => {
            if (dec.name === 'Inject') {
                if (dec.args === null || dec.args.length !== 1) {
                    throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, dec.node, `Unexpected number of arguments to @Inject().`);
                }
                tokenExpr = dec.args[0];
            }
            else if (dec.name === 'Optional') {
                optional = true;
            }
            else if (dec.name === 'SkipSelf') {
                skipSelf = true;
            }
            else if (dec.name === 'Self') {
                self = true;
            }
            else if (dec.name === 'Host') {
                host = true;
            }
            else if (dec.name === 'Attribute') {
                if (dec.args === null || dec.args.length !== 1) {
                    throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, dec.node, `Unexpected number of arguments to @Attribute().`);
                }
                tokenExpr = dec.args[0];
                resolved = compiler_1.R3ResolvedDependencyType.Attribute;
            }
            else {
                throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_UNEXPECTED, dec.node, `Unexpected decorator ${dec.name} on parameter.`);
            }
        });
        if (tokenExpr === null) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.PARAM_MISSING_TOKEN, param.nameNode, `No suitable token for parameter ${param.name || idx} of class ${clazz.name.text}`);
        }
        const token = new compiler_1.WrappedNodeExpr(tokenExpr);
        useType.push({ token, optional, self, skipSelf, host, resolved });
    });
    return useType;
}
exports.getConstructorDependencies = getConstructorDependencies;
function toR3Reference(valueRef, typeRef, valueContext, typeContext) {
    const value = valueRef.toExpression(valueContext, metadata_1.ImportMode.UseExistingImport);
    const type = typeRef.toExpression(typeContext, metadata_1.ImportMode.ForceNewImport);
    if (value === null || type === null) {
        throw new Error(`Could not refer to ${ts.SyntaxKind[valueRef.node.kind]}`);
    }
    return { value, type };
}
exports.toR3Reference = toR3Reference;
function isAngularCore(decorator) {
    return decorator.import !== null && decorator.import.from === '@angular/core';
}
exports.isAngularCore = isAngularCore;
/**
 * Unwrap a `ts.Expression`, removing outer type-casts or parentheses until the expression is in its
 * lowest level form.
 *
 * For example, the expression "(foo as Type)" unwraps to "foo".
 */
function unwrapExpression(node) {
    while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
        node = node.expression;
    }
    return node;
}
exports.unwrapExpression = unwrapExpression;
function expandForwardRef(arg) {
    if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) {
        return null;
    }
    const body = arg.body;
    // Either the body is a ts.Expression directly, or a block with a single return statement.
    if (ts.isBlock(body)) {
        // Block body - look for a single return statement.
        if (body.statements.length !== 1) {
            return null;
        }
        const stmt = body.statements[0];
        if (!ts.isReturnStatement(stmt) || stmt.expression === undefined) {
            return null;
        }
        return stmt.expression;
    }
    else {
        // Shorthand body - return as an expression.
        return body;
    }
}
/**
 * Possibly resolve a forwardRef() expression into the inner value.
 *
 * @param node the forwardRef() expression to resolve
 * @param reflector a ReflectionHost
 * @returns the resolved expression, if the original expression was a forwardRef(), or the original
 * expression otherwise
 */
function unwrapForwardRef(node, reflector) {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) ||
        node.arguments.length !== 1) {
        return node;
    }
    const expr = expandForwardRef(node.arguments[0]);
    if (expr === null) {
        return node;
    }
    const imp = reflector.getImportOfIdentifier(node.expression);
    if (imp === null || imp.from !== '@angular/core' || imp.name !== 'forwardRef') {
        return node;
    }
    else {
        return expr;
    }
}
exports.unwrapForwardRef = unwrapForwardRef;
/**
 * A foreign function resolver for `staticallyResolve` which unwraps forwardRef() expressions.
 *
 * @param ref a Reference to the declaration of the function being called (which might be
 * forwardRef)
 * @param args the arguments to the invocation of the forwardRef expression
 * @returns an unwrapped argument if `ref` pointed to forwardRef, or null otherwise
 */
function forwardRefResolver(ref, args) {
    if (!(ref instanceof metadata_1.AbsoluteReference) || ref.moduleName !== '@angular/core' ||
        ref.symbolName !== 'forwardRef' || args.length !== 1) {
        return null;
    }
    return expandForwardRef(args[0]);
}
exports.forwardRefResolver = forwardRefResolver;
function extractDirectiveGuards(node, reflector) {
    const methods = nodeStaticMethodNames(node, reflector);
    const ngTemplateGuards = methods.filter(method => method.startsWith('ngTemplateGuard_'))
        .map(method => method.split('_', 2)[1]);
    const hasNgTemplateContextGuard = methods.some(name => name === 'ngTemplateContextGuard');
    return { hasNgTemplateContextGuard, ngTemplateGuards };
}
exports.extractDirectiveGuards = extractDirectiveGuards;
function nodeStaticMethodNames(node, reflector) {
    return reflector.getMembersOfClass(node)
        .filter(member => member.kind === host_1.ClassMemberKind.Method && member.isStatic)
        .map(member => member.name);
}
//# sourceMappingURL=util.js.map