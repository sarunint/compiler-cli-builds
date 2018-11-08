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
const metadata_1 = require("../../metadata");
const metadata_2 = require("./metadata");
const util_1 = require("./util");
/**
 * Adapts the `compileIvyInjectable` compiler for `@Injectable` decorators to the Ivy compiler.
 */
class InjectableDecoratorHandler {
    constructor(reflector, isCore) {
        this.reflector = reflector;
        this.isCore = isCore;
    }
    detect(node, decorators) {
        if (!decorators) {
            return undefined;
        }
        return decorators.find(decorator => decorator.name === 'Injectable' && (this.isCore || util_1.isAngularCore(decorator)));
    }
    analyze(node, decorator) {
        return {
            analysis: {
                meta: extractInjectableMetadata(node, decorator, this.reflector, this.isCore),
                metadataStmt: metadata_2.generateSetClassMetadataCall(node, this.reflector, this.isCore),
            },
        };
    }
    compile(node, analysis) {
        const res = compiler_1.compileInjectable(analysis.meta);
        const statements = res.statements;
        if (analysis.metadataStmt !== null) {
            statements.push(analysis.metadataStmt);
        }
        return {
            name: 'ngInjectableDef',
            initializer: res.expression, statements,
            type: res.type,
        };
    }
}
exports.InjectableDecoratorHandler = InjectableDecoratorHandler;
/**
 * Read metadata from the `@Injectable` decorator and produce the `IvyInjectableMetadata`, the input
 * metadata needed to run `compileIvyInjectable`.
 */
function extractInjectableMetadata(clazz, decorator, reflector, isCore) {
    if (clazz.name === undefined) {
        throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ON_ANONYMOUS_CLASS, decorator.node, `@Injectable on anonymous class`);
    }
    const name = clazz.name.text;
    const type = new compiler_1.WrappedNodeExpr(clazz.name);
    const ctorDeps = util_1.getConstructorDependencies(clazz, reflector, isCore);
    if (decorator.args === null) {
        throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_NOT_CALLED, decorator.node, '@Injectable must be called');
    }
    if (decorator.args.length === 0) {
        return {
            name,
            type,
            providedIn: new compiler_1.LiteralExpr(null), ctorDeps,
        };
    }
    else if (decorator.args.length === 1) {
        const metaNode = decorator.args[0];
        // Firstly make sure the decorator argument is an inline literal - if not, it's illegal to
        // transport references from one location to another. This is the problem that lowering
        // used to solve - if this restriction proves too undesirable we can re-implement lowering.
        if (!ts.isObjectLiteralExpression(metaNode)) {
            throw new Error(`In Ivy, decorator metadata must be inline.`);
        }
        // Resolve the fields of the literal into a map of field name to expression.
        const meta = metadata_1.reflectObjectLiteral(metaNode);
        let providedIn = new compiler_1.LiteralExpr(null);
        if (meta.has('providedIn')) {
            providedIn = new compiler_1.WrappedNodeExpr(meta.get('providedIn'));
        }
        let userDeps = undefined;
        if ((meta.has('useClass') || meta.has('useFactory')) && meta.has('deps')) {
            const depsExpr = meta.get('deps');
            if (!ts.isArrayLiteralExpression(depsExpr)) {
                throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_NOT_LITERAL, depsExpr, `In Ivy, deps metadata must be an inline array.`);
            }
            if (depsExpr.elements.length > 0) {
                throw new Error(`deps not yet supported`);
            }
            userDeps = depsExpr.elements.map(dep => getDep(dep, reflector));
        }
        if (meta.has('useValue')) {
            return {
                name,
                type,
                ctorDeps,
                providedIn,
                useValue: new compiler_1.WrappedNodeExpr(meta.get('useValue'))
            };
        }
        else if (meta.has('useExisting')) {
            return {
                name,
                type,
                ctorDeps,
                providedIn,
                useExisting: new compiler_1.WrappedNodeExpr(meta.get('useExisting'))
            };
        }
        else if (meta.has('useClass')) {
            return {
                name,
                type,
                ctorDeps,
                providedIn,
                useClass: new compiler_1.WrappedNodeExpr(meta.get('useClass')), userDeps
            };
        }
        else if (meta.has('useFactory')) {
            // useFactory is special - the 'deps' property must be analyzed.
            const factory = new compiler_1.WrappedNodeExpr(meta.get('useFactory'));
            return { name, type, providedIn, useFactory: factory, ctorDeps, userDeps };
        }
        else {
            return { name, type, providedIn, ctorDeps };
        }
    }
    else {
        throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, decorator.args[2], 'Too many arguments to @Injectable');
    }
}
function getDep(dep, reflector) {
    const meta = {
        token: new compiler_1.WrappedNodeExpr(dep),
        host: false,
        resolved: compiler_1.R3ResolvedDependencyType.Token,
        optional: false,
        self: false,
        skipSelf: false,
    };
    function maybeUpdateDecorator(dec, reflector, token) {
        const source = reflector.getImportOfIdentifier(dec);
        if (source === null || source.from !== '@angular/core') {
            return;
        }
        switch (source.name) {
            case 'Inject':
                if (token !== undefined) {
                    meta.token = new compiler_1.WrappedNodeExpr(token);
                }
                break;
            case 'Optional':
                meta.optional = true;
                break;
            case 'SkipSelf':
                meta.skipSelf = true;
                break;
            case 'Self':
                meta.self = true;
                break;
        }
    }
    if (ts.isArrayLiteralExpression(dep)) {
        dep.elements.forEach(el => {
            if (ts.isIdentifier(el)) {
                maybeUpdateDecorator(el, reflector);
            }
            else if (ts.isNewExpression(el) && ts.isIdentifier(el.expression)) {
                const token = el.arguments && el.arguments.length > 0 && el.arguments[0] || undefined;
                maybeUpdateDecorator(el.expression, reflector, token);
            }
        });
    }
    return meta;
}
//# sourceMappingURL=injectable.js.map