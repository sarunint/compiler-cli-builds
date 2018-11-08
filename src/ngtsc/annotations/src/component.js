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
const path = require("path");
const ts = require("typescript");
const diagnostics_1 = require("../../diagnostics");
const metadata_1 = require("../../metadata");
const directive_1 = require("./directive");
const metadata_2 = require("./metadata");
const util_1 = require("./util");
const EMPTY_MAP = new Map();
/**
 * `DecoratorHandler` which handles the `@Component` annotation.
 */
class ComponentDecoratorHandler {
    constructor(checker, reflector, scopeRegistry, isCore, resourceLoader, rootDirs) {
        this.checker = checker;
        this.reflector = reflector;
        this.scopeRegistry = scopeRegistry;
        this.isCore = isCore;
        this.resourceLoader = resourceLoader;
        this.rootDirs = rootDirs;
        this.literalCache = new Map();
    }
    detect(node, decorators) {
        if (!decorators) {
            return undefined;
        }
        return decorators.find(decorator => decorator.name === 'Component' && (this.isCore || util_1.isAngularCore(decorator)));
    }
    preanalyze(node, decorator) {
        const meta = this._resolveLiteral(decorator);
        const component = metadata_1.reflectObjectLiteral(meta);
        if (this.resourceLoader.preload !== undefined && component.has('templateUrl')) {
            const templateUrlExpr = component.get('templateUrl');
            const templateUrl = metadata_1.staticallyResolve(templateUrlExpr, this.reflector, this.checker);
            if (typeof templateUrl !== 'string') {
                throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, templateUrlExpr, 'templateUrl must be a string');
            }
            const url = path.posix.resolve(path.dirname(node.getSourceFile().fileName), templateUrl);
            return this.resourceLoader.preload(url);
        }
        return undefined;
    }
    analyze(node, decorator) {
        const meta = this._resolveLiteral(decorator);
        this.literalCache.delete(decorator);
        // @Component inherits @Directive, so begin by extracting the @Directive metadata and building
        // on it.
        const directiveResult = directive_1.extractDirectiveMetadata(node, decorator, this.checker, this.reflector, this.isCore);
        if (directiveResult === undefined) {
            // `extractDirectiveMetadata` returns undefined when the @Directive has `jit: true`. In this
            // case, compilation of the decorator is skipped. Returning an empty object signifies
            // that no analysis was produced.
            return {};
        }
        // Next, read the `@Component`-specific fields.
        const { decoratedElements, decorator: component, metadata } = directiveResult;
        let templateStr = null;
        if (component.has('templateUrl')) {
            const templateUrlExpr = component.get('templateUrl');
            const templateUrl = metadata_1.staticallyResolve(templateUrlExpr, this.reflector, this.checker);
            if (typeof templateUrl !== 'string') {
                throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, templateUrlExpr, 'templateUrl must be a string');
            }
            const url = path.posix.resolve(path.dirname(node.getSourceFile().fileName), templateUrl);
            templateStr = this.resourceLoader.load(url);
        }
        else if (component.has('template')) {
            const templateExpr = component.get('template');
            const resolvedTemplate = metadata_1.staticallyResolve(templateExpr, this.reflector, this.checker);
            if (typeof resolvedTemplate !== 'string') {
                throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, templateExpr, 'template must be a string');
            }
            templateStr = resolvedTemplate;
        }
        else {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.COMPONENT_MISSING_TEMPLATE, decorator.node, 'component is missing a template');
        }
        let preserveWhitespaces = false;
        if (component.has('preserveWhitespaces')) {
            const expr = component.get('preserveWhitespaces');
            const value = metadata_1.staticallyResolve(expr, this.reflector, this.checker);
            if (typeof value !== 'boolean') {
                throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, expr, 'preserveWhitespaces must be a boolean');
            }
            preserveWhitespaces = value;
        }
        const viewProviders = component.has('viewProviders') ?
            new compiler_1.WrappedNodeExpr(component.get('viewProviders')) :
            null;
        // Go through the root directories for this project, and select the one with the smallest
        // relative path representation.
        const filePath = node.getSourceFile().fileName;
        const relativeFilePath = this.rootDirs.reduce((previous, rootDir) => {
            const candidate = path.posix.relative(rootDir, filePath);
            if (previous === undefined || candidate.length < previous.length) {
                return candidate;
            }
            else {
                return previous;
            }
        }, undefined);
        const template = compiler_1.parseTemplate(templateStr, `${node.getSourceFile().fileName}#${node.name.text}/template.html`, { preserveWhitespaces }, relativeFilePath);
        if (template.errors !== undefined) {
            throw new Error(`Errors parsing template: ${template.errors.map(e => e.toString()).join(', ')}`);
        }
        // If the component has a selector, it should be registered with the `SelectorScopeRegistry` so
        // when this component appears in an `@NgModule` scope, its selector can be determined.
        if (metadata.selector !== null) {
            const ref = new metadata_1.ResolvedReference(node, node.name);
            this.scopeRegistry.registerDirective(node, Object.assign({ ref, name: node.name.text, directive: ref, selector: metadata.selector, exportAs: metadata.exportAs, inputs: metadata.inputs, outputs: metadata.outputs, queries: metadata.queries.map(query => query.propertyName), isComponent: true }, util_1.extractDirectiveGuards(node, this.reflector)));
        }
        // Construct the list of view queries.
        const coreModule = this.isCore ? undefined : '@angular/core';
        const viewChildFromFields = directive_1.queriesFromFields(metadata_1.filterToMembersWithDecorator(decoratedElements, 'ViewChild', coreModule), this.reflector, this.checker);
        const viewChildrenFromFields = directive_1.queriesFromFields(metadata_1.filterToMembersWithDecorator(decoratedElements, 'ViewChildren', coreModule), this.reflector, this.checker);
        const viewQueries = [...viewChildFromFields, ...viewChildrenFromFields];
        if (component.has('queries')) {
            const queriesFromDecorator = directive_1.extractQueriesFromDecorator(component.get('queries'), this.reflector, this.checker, this.isCore);
            viewQueries.push(...queriesFromDecorator.view);
        }
        let styles = null;
        if (component.has('styles')) {
            styles = directive_1.parseFieldArrayValue(component, 'styles', this.reflector, this.checker);
        }
        let encapsulation = 0;
        if (component.has('encapsulation')) {
            encapsulation = parseInt(metadata_1.staticallyResolve(component.get('encapsulation'), this.reflector, this.checker));
        }
        let animations = null;
        if (component.has('animations')) {
            animations = new compiler_1.WrappedNodeExpr(component.get('animations'));
        }
        return {
            analysis: {
                meta: Object.assign({}, metadata, { template,
                    viewQueries,
                    encapsulation, styles: styles || [], 
                    // These will be replaced during the compilation step, after all `NgModule`s have been
                    // analyzed and the full compilation scope for the component can be realized.
                    pipes: EMPTY_MAP, directives: EMPTY_MAP, wrapDirectivesAndPipesInClosure: false, //
                    animations,
                    viewProviders }),
                metadataStmt: metadata_2.generateSetClassMetadataCall(node, this.reflector, this.isCore),
                parsedTemplate: template.nodes,
            },
            typeCheck: true,
        };
    }
    typeCheck(ctx, node, meta) {
        const scope = this.scopeRegistry.lookupCompilationScopeAsRefs(node);
        const matcher = new compiler_1.SelectorMatcher();
        if (scope !== null) {
            scope.directives.forEach((meta, selector) => { matcher.addSelectables(compiler_1.CssSelector.parse(selector), meta); });
            ctx.addTemplate(node, meta.parsedTemplate, matcher);
        }
    }
    compile(node, analysis, pool) {
        // Check whether this component was registered with an NgModule. If so, it should be compiled
        // under that module's compilation scope.
        const scope = this.scopeRegistry.lookupCompilationScope(node);
        let metadata = analysis.meta;
        if (scope !== null) {
            // Replace the empty components and directives from the analyze() step with a fully expanded
            // scope. This is possible now because during compile() the whole compilation unit has been
            // fully analyzed.
            const { pipes, containsForwardDecls } = scope;
            const directives = new Map();
            scope.directives.forEach((meta, selector) => directives.set(selector, meta.directive));
            const wrapDirectivesAndPipesInClosure = !!containsForwardDecls;
            metadata = Object.assign({}, metadata, { directives, pipes, wrapDirectivesAndPipesInClosure });
        }
        const res = compiler_1.compileComponentFromMetadata(metadata, pool, compiler_1.makeBindingParser());
        const statements = res.statements;
        if (analysis.metadataStmt !== null) {
            statements.push(analysis.metadataStmt);
        }
        return {
            name: 'ngComponentDef',
            initializer: res.expression, statements,
            type: res.type,
        };
    }
    _resolveLiteral(decorator) {
        if (this.literalCache.has(decorator)) {
            return this.literalCache.get(decorator);
        }
        if (decorator.args === null || decorator.args.length !== 1) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, decorator.node, `Incorrect number of arguments to @Component decorator`);
        }
        const meta = util_1.unwrapExpression(decorator.args[0]);
        if (!ts.isObjectLiteralExpression(meta)) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARG_NOT_LITERAL, meta, `Decorator argument must be literal.`);
        }
        this.literalCache.set(decorator, meta);
        return meta;
    }
}
exports.ComponentDecoratorHandler = ComponentDecoratorHandler;
//# sourceMappingURL=component.js.map