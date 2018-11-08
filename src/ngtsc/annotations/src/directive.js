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
const metadata_2 = require("./metadata");
const util_1 = require("./util");
const EMPTY_OBJECT = {};
class DirectiveDecoratorHandler {
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
        return decorators.find(decorator => decorator.name === 'Directive' && (this.isCore || util_1.isAngularCore(decorator)));
    }
    analyze(node, decorator) {
        const directiveResult = extractDirectiveMetadata(node, decorator, this.checker, this.reflector, this.isCore);
        const analysis = directiveResult && directiveResult.metadata;
        // If the directive has a selector, it should be registered with the `SelectorScopeRegistry` so
        // when this directive appears in an `@NgModule` scope, its selector can be determined.
        if (analysis && analysis.selector !== null) {
            let ref = new metadata_1.ResolvedReference(node, node.name);
            this.scopeRegistry.registerDirective(node, Object.assign({ ref, directive: ref, name: node.name.text, selector: analysis.selector, exportAs: analysis.exportAs, inputs: analysis.inputs, outputs: analysis.outputs, queries: analysis.queries.map(query => query.propertyName), isComponent: false }, util_1.extractDirectiveGuards(node, this.reflector)));
        }
        if (analysis === undefined) {
            return {};
        }
        return {
            analysis: {
                meta: analysis,
                metadataStmt: metadata_2.generateSetClassMetadataCall(node, this.reflector, this.isCore),
            }
        };
    }
    compile(node, analysis, pool) {
        const res = compiler_1.compileDirectiveFromMetadata(analysis.meta, pool, compiler_1.makeBindingParser());
        const statements = res.statements;
        if (analysis.metadataStmt !== null) {
            statements.push(analysis.metadataStmt);
        }
        return {
            name: 'ngDirectiveDef',
            initializer: res.expression,
            statements: statements,
            type: res.type,
        };
    }
}
exports.DirectiveDecoratorHandler = DirectiveDecoratorHandler;
/**
 * Helper function to extract metadata from a `Directive` or `Component`.
 */
function extractDirectiveMetadata(clazz, decorator, checker, reflector, isCore) {
    if (decorator.args === null || decorator.args.length !== 1) {
        throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, decorator.node, `Incorrect number of arguments to @${decorator.name} decorator`);
    }
    const meta = util_1.unwrapExpression(decorator.args[0]);
    if (!ts.isObjectLiteralExpression(meta)) {
        throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARG_NOT_LITERAL, meta, `@${decorator.name} argument must be literal.`);
    }
    const directive = metadata_1.reflectObjectLiteral(meta);
    if (directive.has('jit')) {
        // The only allowed value is true, so there's no need to expand further.
        return undefined;
    }
    const members = reflector.getMembersOfClass(clazz);
    // Precompute a list of ts.ClassElements that have decorators. This includes things like @Input,
    // @Output, @HostBinding, etc.
    const decoratedElements = members.filter(member => !member.isStatic && member.decorators !== null);
    const coreModule = isCore ? undefined : '@angular/core';
    // Construct the map of inputs both from the @Directive/@Component
    // decorator, and the decorated
    // fields.
    const inputsFromMeta = parseFieldToPropertyMapping(directive, 'inputs', reflector, checker);
    const inputsFromFields = parseDecoratedFields(metadata_1.filterToMembersWithDecorator(decoratedElements, 'Input', coreModule), reflector, checker, resolveInput);
    // And outputs.
    const outputsFromMeta = parseFieldToPropertyMapping(directive, 'outputs', reflector, checker);
    const outputsFromFields = parseDecoratedFields(metadata_1.filterToMembersWithDecorator(decoratedElements, 'Output', coreModule), reflector, checker, resolveOutput);
    // Construct the list of queries.
    const contentChildFromFields = queriesFromFields(metadata_1.filterToMembersWithDecorator(decoratedElements, 'ContentChild', coreModule), reflector, checker);
    const contentChildrenFromFields = queriesFromFields(metadata_1.filterToMembersWithDecorator(decoratedElements, 'ContentChildren', coreModule), reflector, checker);
    const queries = [...contentChildFromFields, ...contentChildrenFromFields];
    if (directive.has('queries')) {
        const queriesFromDecorator = extractQueriesFromDecorator(directive.get('queries'), reflector, checker, isCore);
        queries.push(...queriesFromDecorator.content);
    }
    // Parse the selector.
    let selector = '';
    if (directive.has('selector')) {
        const expr = directive.get('selector');
        const resolved = metadata_1.staticallyResolve(expr, reflector, checker);
        if (typeof resolved !== 'string') {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, expr, `selector must be a string`);
        }
        selector = resolved;
    }
    const host = extractHostBindings(directive, decoratedElements, reflector, checker, coreModule);
    const providers = directive.has('providers') ? new compiler_1.WrappedNodeExpr(directive.get('providers')) : null;
    // Determine if `ngOnChanges` is a lifecycle hook defined on the component.
    const usesOnChanges = members.some(member => !member.isStatic && member.kind === host_1.ClassMemberKind.Method &&
        member.name === 'ngOnChanges');
    // Parse exportAs.
    let exportAs = null;
    if (directive.has('exportAs')) {
        const expr = directive.get('exportAs');
        const resolved = metadata_1.staticallyResolve(expr, reflector, checker);
        if (typeof resolved !== 'string') {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, expr, `exportAs must be a string`);
        }
        exportAs = resolved;
    }
    // Detect if the component inherits from another class
    const usesInheritance = clazz.heritageClauses !== undefined &&
        clazz.heritageClauses.some(hc => hc.token === ts.SyntaxKind.ExtendsKeyword);
    const metadata = {
        name: clazz.name.text,
        deps: util_1.getConstructorDependencies(clazz, reflector, isCore), host,
        lifecycle: {
            usesOnChanges,
        },
        inputs: Object.assign({}, inputsFromMeta, inputsFromFields),
        outputs: Object.assign({}, outputsFromMeta, outputsFromFields), queries, selector,
        type: new compiler_1.WrappedNodeExpr(clazz.name),
        typeArgumentCount: reflector.getGenericArityOfClass(clazz) || 0,
        typeSourceSpan: null, usesInheritance, exportAs, providers
    };
    return { decoratedElements, decorator: directive, metadata };
}
exports.extractDirectiveMetadata = extractDirectiveMetadata;
function extractQueryMetadata(exprNode, name, args, propertyName, reflector, checker) {
    if (args.length === 0) {
        throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, exprNode, `@${name} must have arguments`);
    }
    const first = name === 'ViewChild' || name === 'ContentChild';
    const node = util_1.unwrapForwardRef(args[0], reflector);
    const arg = metadata_1.staticallyResolve(node, reflector, checker);
    // Extract the predicate
    let predicate = null;
    if (arg instanceof metadata_1.Reference) {
        predicate = new compiler_1.WrappedNodeExpr(node);
    }
    else if (typeof arg === 'string') {
        predicate = [arg];
    }
    else if (isStringArrayOrDie(arg, '@' + name)) {
        predicate = arg;
    }
    else {
        throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, node, `@${name} predicate cannot be interpreted`);
    }
    // Extract the read and descendants options.
    let read = null;
    // The default value for descendants is true for every decorator except @ContentChildren.
    let descendants = name !== 'ContentChildren';
    if (args.length === 2) {
        const optionsExpr = util_1.unwrapExpression(args[1]);
        if (!ts.isObjectLiteralExpression(optionsExpr)) {
            throw new Error(`@${name} options must be an object literal`);
        }
        const options = metadata_1.reflectObjectLiteral(optionsExpr);
        if (options.has('read')) {
            read = new compiler_1.WrappedNodeExpr(options.get('read'));
        }
        if (options.has('descendants')) {
            const descendantsValue = metadata_1.staticallyResolve(options.get('descendants'), reflector, checker);
            if (typeof descendantsValue !== 'boolean') {
                throw new Error(`@${name} options.descendants must be a boolean`);
            }
            descendants = descendantsValue;
        }
    }
    else if (args.length > 2) {
        // Too many arguments.
        throw new Error(`@${name} has too many arguments`);
    }
    return {
        propertyName, predicate, first, descendants, read,
    };
}
exports.extractQueryMetadata = extractQueryMetadata;
function extractQueriesFromDecorator(queryData, reflector, checker, isCore) {
    const content = [], view = [];
    const expr = util_1.unwrapExpression(queryData);
    if (!ts.isObjectLiteralExpression(queryData)) {
        throw new Error(`queries metadata must be an object literal`);
    }
    metadata_1.reflectObjectLiteral(queryData).forEach((queryExpr, propertyName) => {
        queryExpr = util_1.unwrapExpression(queryExpr);
        if (!ts.isNewExpression(queryExpr) || !ts.isIdentifier(queryExpr.expression)) {
            throw new Error(`query metadata must be an instance of a query type`);
        }
        const type = reflector.getImportOfIdentifier(queryExpr.expression);
        if (type === null || (!isCore && type.from !== '@angular/core') ||
            !QUERY_TYPES.has(type.name)) {
            throw new Error(`query metadata must be an instance of a query type`);
        }
        const query = extractQueryMetadata(queryExpr, type.name, queryExpr.arguments || [], propertyName, reflector, checker);
        if (type.name.startsWith('Content')) {
            content.push(query);
        }
        else {
            view.push(query);
        }
    });
    return { content, view };
}
exports.extractQueriesFromDecorator = extractQueriesFromDecorator;
function isStringArrayOrDie(value, name) {
    if (!Array.isArray(value)) {
        return false;
    }
    for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string') {
            throw new Error(`Failed to resolve ${name}[${i}] to a string`);
        }
    }
    return true;
}
function parseFieldArrayValue(directive, field, reflector, checker) {
    if (!directive.has(field)) {
        return null;
    }
    // Resolve the field of interest from the directive metadata to a string[].
    const value = metadata_1.staticallyResolve(directive.get(field), reflector, checker);
    if (!isStringArrayOrDie(value, field)) {
        throw new Error(`Failed to resolve @Directive.${field}`);
    }
    return value;
}
exports.parseFieldArrayValue = parseFieldArrayValue;
/**
 * Interpret property mapping fields on the decorator (e.g. inputs or outputs) and return the
 * correctly shaped metadata object.
 */
function parseFieldToPropertyMapping(directive, field, reflector, checker) {
    const metaValues = parseFieldArrayValue(directive, field, reflector, checker);
    if (!metaValues) {
        return EMPTY_OBJECT;
    }
    return metaValues.reduce((results, value) => {
        // Either the value is 'field' or 'field: property'. In the first case, `property` will
        // be undefined, in which case the field name should also be used as the property name.
        const [field, property] = value.split(':', 2).map(str => str.trim());
        results[field] = property || field;
        return results;
    }, {});
}
/**
 * Parse property decorators (e.g. `Input` or `Output`) and return the correctly shaped metadata
 * object.
 */
function parseDecoratedFields(fields, reflector, checker, mapValueResolver) {
    return fields.reduce((results, field) => {
        const fieldName = field.member.name;
        field.decorators.forEach(decorator => {
            // The decorator either doesn't have an argument (@Input()) in which case the property
            // name is used, or it has one argument (@Output('named')).
            if (decorator.args == null || decorator.args.length === 0) {
                results[fieldName] = fieldName;
            }
            else if (decorator.args.length === 1) {
                const property = metadata_1.staticallyResolve(decorator.args[0], reflector, checker);
                if (typeof property !== 'string') {
                    throw new Error(`Decorator argument must resolve to a string`);
                }
                results[fieldName] = mapValueResolver(property, fieldName);
            }
            else {
                // Too many arguments.
                throw new Error(`Decorator must have 0 or 1 arguments, got ${decorator.args.length} argument(s)`);
            }
        });
        return results;
    }, {});
}
function resolveInput(publicName, internalName) {
    return [publicName, internalName];
}
function resolveOutput(publicName, internalName) {
    return publicName;
}
function queriesFromFields(fields, reflector, checker) {
    return fields.map(({ member, decorators }) => {
        if (decorators.length !== 1) {
            throw new Error(`Cannot have multiple query decorators on the same class member`);
        }
        else if (!isPropertyTypeMember(member)) {
            throw new Error(`Query decorator must go on a property-type member`);
        }
        const decorator = decorators[0];
        return extractQueryMetadata(decorator.node, decorator.name, decorator.args || [], member.name, reflector, checker);
    });
}
exports.queriesFromFields = queriesFromFields;
function isPropertyTypeMember(member) {
    return member.kind === host_1.ClassMemberKind.Getter || member.kind === host_1.ClassMemberKind.Setter ||
        member.kind === host_1.ClassMemberKind.Property;
}
function extractHostBindings(metadata, members, reflector, checker, coreModule) {
    let hostMetadata = {};
    if (metadata.has('host')) {
        const expr = metadata.get('host');
        const hostMetaMap = metadata_1.staticallyResolve(expr, reflector, checker);
        if (!(hostMetaMap instanceof Map)) {
            throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARG_NOT_LITERAL, expr, `Decorator host metadata must be an object`);
        }
        hostMetaMap.forEach((value, key) => {
            if (typeof value !== 'string' || typeof key !== 'string') {
                throw new Error(`Decorator host metadata must be a string -> string object, got ${value}`);
            }
            hostMetadata[key] = value;
        });
    }
    const { attributes, listeners, properties, animations } = compiler_1.parseHostBindings(hostMetadata);
    metadata_1.filterToMembersWithDecorator(members, 'HostBinding', coreModule)
        .forEach(({ member, decorators }) => {
        decorators.forEach(decorator => {
            let hostPropertyName = member.name;
            if (decorator.args !== null && decorator.args.length > 0) {
                if (decorator.args.length !== 1) {
                    throw new Error(`@HostBinding() can have at most one argument`);
                }
                const resolved = metadata_1.staticallyResolve(decorator.args[0], reflector, checker);
                if (typeof resolved !== 'string') {
                    throw new Error(`@HostBinding()'s argument must be a string`);
                }
                hostPropertyName = resolved;
            }
            properties[hostPropertyName] = member.name;
        });
    });
    metadata_1.filterToMembersWithDecorator(members, 'HostListener', coreModule)
        .forEach(({ member, decorators }) => {
        decorators.forEach(decorator => {
            let eventName = member.name;
            let args = [];
            if (decorator.args !== null && decorator.args.length > 0) {
                if (decorator.args.length > 2) {
                    throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.DECORATOR_ARITY_WRONG, decorator.args[2], `@HostListener() can have at most two arguments`);
                }
                const resolved = metadata_1.staticallyResolve(decorator.args[0], reflector, checker);
                if (typeof resolved !== 'string') {
                    throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, decorator.args[0], `@HostListener()'s event name argument must be a string`);
                }
                eventName = resolved;
                if (decorator.args.length === 2) {
                    const resolvedArgs = metadata_1.staticallyResolve(decorator.args[1], reflector, checker);
                    if (!isStringArrayOrDie(resolvedArgs, '@HostListener.args')) {
                        throw new diagnostics_1.FatalDiagnosticError(diagnostics_1.ErrorCode.VALUE_HAS_WRONG_TYPE, decorator.args[1], `@HostListener second argument must be a string array`);
                    }
                    args = resolvedArgs;
                }
            }
            listeners[eventName] = `${member.name}(${args.join(',')})`;
        });
    });
    return { attributes, properties, listeners };
}
const QUERY_TYPES = new Set([
    'ContentChild',
    'ContentChildren',
    'ViewChild',
    'ViewChildren',
]);
//# sourceMappingURL=directive.js.map