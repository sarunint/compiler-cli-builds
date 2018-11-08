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
 * Compiles @NgModule annotations to ngModuleDef fields.
 *
 * TODO(alxhub): handle injector side of things as well.
 */
class NgModuleDecoratorHandler {
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
        return decorators.find(decorator => decorator.name === 'NgModule' && (this.isCore || util_1.isAngularCore(decorator)));
    }
    analyze(node, decorator) {
        if (decorator.args === null || decorator.args.length > 1) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, decorator.node, `Incorrect number of arguments to @NgModule decorator`);
        }
        // @NgModule can be invoked without arguments. In case it is, pretend as if a blank object
        // literal was specified. This simplifies the code below.
        const meta = decorator.args.length === 1 ? util_1.unwrapExpression(decorator.args[0]) :
            ts.createObjectLiteral([]);
        if (!ts.isObjectLiteralExpression(meta)) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARG_NOT_LITERAL, meta, '@NgModule argument must be an object literal');
        }
        const ngModule = metadata_1.reflectObjectLiteral(meta);
        if (ngModule.has('jit')) {
            // The only allowed value is true, so there's no need to expand further.
            return {};
        }
        // Extract the module declarations, imports, and exports.
        let declarations = [];
        if (ngModule.has('declarations')) {
            const expr = ngModule.get('declarations');
            const declarationMeta = metadata_1.staticallyResolve(expr, this.reflector, this.checker);
            declarations = this.resolveTypeList(expr, declarationMeta, 'declarations');
        }
        let imports = [];
        if (ngModule.has('imports')) {
            const expr = ngModule.get('imports');
            const importsMeta = metadata_1.staticallyResolve(expr, this.reflector, this.checker, ref => this._extractModuleFromModuleWithProvidersFn(ref.node));
            imports = this.resolveTypeList(expr, importsMeta, 'imports');
        }
        let exports = [];
        if (ngModule.has('exports')) {
            const expr = ngModule.get('exports');
            const exportsMeta = metadata_1.staticallyResolve(expr, this.reflector, this.checker, ref => this._extractModuleFromModuleWithProvidersFn(ref.node));
            exports = this.resolveTypeList(expr, exportsMeta, 'exports');
        }
        let bootstrap = [];
        if (ngModule.has('bootstrap')) {
            const expr = ngModule.get('bootstrap');
            const bootstrapMeta = metadata_1.staticallyResolve(expr, this.reflector, this.checker);
            bootstrap = this.resolveTypeList(expr, bootstrapMeta, 'bootstrap');
        }
        // Register this module's information with the SelectorScopeRegistry. This ensures that during
        // the compile() phase, the module's metadata is available for selector scope computation.
        this.scopeRegistry.registerModule(node, { declarations, imports, exports });
        const valueContext = node.getSourceFile();
        let typeContext = valueContext;
        const typeNode = this.reflector.getDtsDeclarationOfClass(node);
        if (typeNode !== null) {
            typeContext = typeNode.getSourceFile();
        }
        const ngModuleDef = {
            type: new compiler_1.WrappedNodeExpr(node.name),
            bootstrap: bootstrap.map(bootstrap => this._toR3Reference(bootstrap, valueContext, typeContext)),
            declarations: declarations.map(decl => this._toR3Reference(decl, valueContext, typeContext)),
            exports: exports.map(exp => this._toR3Reference(exp, valueContext, typeContext)),
            imports: imports.map(imp => this._toR3Reference(imp, valueContext, typeContext)),
            emitInline: false,
        };
        const providers = ngModule.has('providers') ?
            new compiler_1.WrappedNodeExpr(ngModule.get('providers')) :
            new compiler_1.LiteralArrayExpr([]);
        const injectorImports = [];
        if (ngModule.has('imports')) {
            injectorImports.push(new compiler_1.WrappedNodeExpr(ngModule.get('imports')));
        }
        if (ngModule.has('exports')) {
            injectorImports.push(new compiler_1.WrappedNodeExpr(ngModule.get('exports')));
        }
        const ngInjectorDef = {
            name: node.name.text,
            type: new compiler_1.WrappedNodeExpr(node.name),
            deps: util_1.getConstructorDependencies(node, this.reflector, this.isCore), providers,
            imports: new compiler_1.LiteralArrayExpr(injectorImports),
        };
        return {
            analysis: {
                ngModuleDef,
                ngInjectorDef,
                metadataStmt: metadata_2.generateSetClassMetadataCall(node, this.reflector, this.isCore),
            },
            factorySymbolName: node.name !== undefined ? node.name.text : undefined,
        };
    }
    compile(node, analysis) {
        const ngInjectorDef = compiler_1.compileInjector(analysis.ngInjectorDef);
        const ngModuleDef = compiler_1.compileNgModule(analysis.ngModuleDef);
        const ngModuleStatements = ngModuleDef.additionalStatements;
        if (analysis.metadataStmt !== null) {
            ngModuleStatements.push(analysis.metadataStmt);
        }
        return [
            {
                name: 'ngModuleDef',
                initializer: ngModuleDef.expression,
                statements: ngModuleStatements,
                type: ngModuleDef.type,
            },
            {
                name: 'ngInjectorDef',
                initializer: ngInjectorDef.expression,
                statements: ngInjectorDef.statements,
                type: ngInjectorDef.type,
            },
        ];
    }
    _toR3Reference(valueRef, valueContext, typeContext) {
        if (!(valueRef instanceof metadata_1.ResolvedReference)) {
            return util_1.toR3Reference(valueRef, valueRef, valueContext, valueContext);
        }
        else {
            let typeRef = valueRef;
            let typeNode = this.reflector.getDtsDeclarationOfClass(typeRef.node);
            if (typeNode !== null) {
                typeRef = new metadata_1.ResolvedReference(typeNode, typeNode.name);
            }
            return util_1.toR3Reference(valueRef, typeRef, valueContext, typeContext);
        }
    }
    /**
     * Given a `FunctionDeclaration` or `MethodDeclaration`, check if it is typed as a
     * `ModuleWithProviders` and return an expression referencing the module if available.
     */
    _extractModuleFromModuleWithProvidersFn(node) {
        const type = node.type;
        // Examine the type of the function to see if it's a ModuleWithProviders reference.
        if (type === undefined || !ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) {
            return null;
        }
        // Look at the type itself to see where it comes from.
        const id = this.reflector.getImportOfIdentifier(type.typeName);
        // If it's not named ModuleWithProviders, bail.
        if (id === null || id.name !== 'ModuleWithProviders') {
            return null;
        }
        // If it's not from @angular/core, bail.
        if (!this.isCore && id.from !== '@angular/core') {
            return null;
        }
        // If there's no type parameter specified, bail.
        if (type.typeArguments === undefined || type.typeArguments.length !== 1) {
            return null;
        }
        const arg = type.typeArguments[0];
        // If the argument isn't an Identifier, bail.
        if (!ts.isTypeReferenceNode(arg) || !ts.isIdentifier(arg.typeName)) {
            return null;
        }
        return arg.typeName;
    }
    /**
     * Compute a list of `Reference`s from a resolved metadata value.
     */
    resolveTypeList(expr, resolvedList, name) {
        const refList = [];
        if (!Array.isArray(resolvedList)) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, expr, `Expected array when reading property ${name}`);
        }
        resolvedList.forEach((entry, idx) => {
            // Unwrap ModuleWithProviders for modules that are locally declared (and thus static
            // resolution was able to descend into the function and return an object literal, a Map).
            if (entry instanceof Map && entry.has('ngModule')) {
                entry = entry.get('ngModule');
            }
            if (Array.isArray(entry)) {
                // Recurse into nested arrays.
                refList.push(...this.resolveTypeList(expr, entry, name));
            }
            else if (isDeclarationReference(entry)) {
                if (!entry.expressable) {
                    throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, expr, `One entry in ${name} is not a type`);
                }
                else if (!this.reflector.isClass(entry.node)) {
                    throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, entry.node, `Entry is not a type, but is used as such in ${name} array`);
                }
                refList.push(entry);
            }
            else {
                // TODO(alxhub): expand ModuleWithProviders.
                throw new Error(`Value at position ${idx} in ${name} array is not a reference: ${entry}`);
            }
        });
        return refList;
    }
}
exports.NgModuleDecoratorHandler = NgModuleDecoratorHandler;
function isDeclarationReference(ref) {
    return ref instanceof metadata_1.Reference &&
        (ts.isClassDeclaration(ref.node) || ts.isFunctionDeclaration(ref.node) ||
            ts.isVariableDeclaration(ref.node));
}
//# sourceMappingURL=ng_module.js.map