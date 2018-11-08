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
class PipeDecoratorHandler {
    constructor(checker, reflector, scopeRegistry, isCore) {
        this.checker = checker;
        this.reflector = reflector;
        this.scopeRegistry = scopeRegistry;
        this.isCore = isCore;
    }
    detect(node, decorators) {
        if (!decorators) {
            return undefined;
        }
        return decorators.find(decorator => decorator.name === 'Pipe' && (this.isCore || util_1.isAngularCore(decorator)));
    }
    analyze(clazz, decorator) {
        if (clazz.name === undefined) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ON_ANONYMOUS_CLASS, clazz, `@Pipes must have names`);
        }
        const name = clazz.name.text;
        const type = new compiler_1.WrappedNodeExpr(clazz.name);
        if (decorator.args === null) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_NOT_CALLED, decorator.node, `@Pipe must be called`);
        }
        if (decorator.args.length !== 1) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, decorator.node, '@Pipe must have exactly one argument');
        }
        const meta = util_1.unwrapExpression(decorator.args[0]);
        if (!ts.isObjectLiteralExpression(meta)) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARG_NOT_LITERAL, meta, '@Pipe must have a literal argument');
        }
        const pipe = metadata_1.reflectObjectLiteral(meta);
        if (!pipe.has('name')) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.PIPE_MISSING_NAME, meta, `@Pipe decorator is missing name field`);
        }
        const pipeNameExpr = pipe.get('name');
        const pipeName = metadata_1.staticallyResolve(pipeNameExpr, this.reflector, this.checker);
        if (typeof pipeName !== 'string') {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, pipeNameExpr, `@Pipe.name must be a string`);
        }
        this.scopeRegistry.registerPipe(clazz, pipeName);
        let pure = true;
        if (pipe.has('pure')) {
            const expr = pipe.get('pure');
            const pureValue = metadata_1.staticallyResolve(expr, this.reflector, this.checker);
            if (typeof pureValue !== 'boolean') {
                throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, expr, `@Pipe.pure must be a boolean`);
            }
            pure = pureValue;
        }
        return {
            analysis: {
                meta: {
                    name,
                    type,
                    pipeName,
                    deps: util_1.getConstructorDependencies(clazz, this.reflector, this.isCore), pure,
                },
                metadataStmt: metadata_2.generateSetClassMetadataCall(clazz, this.reflector, this.isCore),
            },
        };
    }
    compile(node, analysis) {
        const res = compiler_1.compilePipeFromMetadata(analysis.meta);
        const statements = res.statements;
        if (analysis.metadataStmt !== null) {
            statements.push(analysis.metadataStmt);
        }
        return {
            name: 'ngPipeDef',
            initializer: res.expression, statements,
            type: res.type,
        };
    }
}
exports.PipeDecoratorHandler = PipeDecoratorHandler;
//# sourceMappingURL=pipe.js.map