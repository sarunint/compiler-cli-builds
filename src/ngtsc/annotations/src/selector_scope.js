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
const metadata_1 = require("../../metadata");
const reflector_1 = require("../../metadata/src/reflector");
const util_1 = require("./util");
/**
 * Registry which records and correlates static analysis information of Angular types.
 *
 * Once a compilation unit's information is fed into the SelectorScopeRegistry, it can be asked to
 * produce transitive `CompilationScope`s for components.
 */
class SelectorScopeRegistry {
    constructor(checker, reflector) {
        this.checker = checker;
        this.reflector = reflector;
        /**
         *  Map of modules declared in the current compilation unit to their (local) metadata.
         */
        this._moduleToData = new Map();
        /**
         * Map of modules to their cached `CompilationScope`s.
         */
        this._compilationScopeCache = new Map();
        /**
         * Map of components/directives to their metadata.
         */
        this._directiveToMetadata = new Map();
        /**
         * Map of pipes to their name.
         */
        this._pipeToName = new Map();
        /**
         * Map of components/directives/pipes to their module.
         */
        this._declararedTypeToModule = new Map();
    }
    /**
     * Register a module's metadata with the registry.
     */
    registerModule(node, data) {
        node = ts.getOriginalNode(node);
        if (this._moduleToData.has(node)) {
            throw new Error(`Module already registered: ${reflector_1.reflectNameOfDeclaration(node)}`);
        }
        this._moduleToData.set(node, data);
        // Register all of the module's declarations in the context map as belonging to this module.
        data.declarations.forEach(decl => {
            this._declararedTypeToModule.set(ts.getOriginalNode(decl.node), node);
        });
    }
    /**
     * Register the metadata of a component or directive with the registry.
     */
    registerDirective(node, metadata) {
        node = ts.getOriginalNode(node);
        if (this._directiveToMetadata.has(node)) {
            throw new Error(`Selector already registered: ${reflector_1.reflectNameOfDeclaration(node)} ${metadata.selector}`);
        }
        this._directiveToMetadata.set(node, metadata);
    }
    /**
     * Register the name of a pipe with the registry.
     */
    registerPipe(node, name) {
        node = ts.getOriginalNode(node);
        this._pipeToName.set(node, name);
    }
    lookupCompilationScopeAsRefs(node) {
        node = ts.getOriginalNode(node);
        // If the component has no associated module, then it has no compilation scope.
        if (!this._declararedTypeToModule.has(node)) {
            return null;
        }
        const module = this._declararedTypeToModule.get(node);
        // Compilation scope computation is somewhat expensive, so it's cached. Check the cache for
        // the module.
        if (this._compilationScopeCache.has(module)) {
            // The compilation scope was cached.
            const scope = this._compilationScopeCache.get(module);
            // The scope as cached is in terms of References, not Expressions. Converting between them
            // requires knowledge of the context file (in this case, the component node's source file).
            return scope;
        }
        // This is the first time the scope for this module is being computed.
        const directives = new Map();
        const pipes = new Map();
        // Process the declaration scope of the module, and lookup the selector of every declared type.
        // The initial value of ngModuleImportedFrom is 'null' which signifies that the NgModule
        // was not imported from a .d.ts source.
        this.lookupScopesOrDie(module, /* ngModuleImportedFrom */ null).compilation.forEach(ref => {
            const node = ts.getOriginalNode(ref.node);
            // Either the node represents a directive or a pipe. Look for both.
            const metadata = this.lookupDirectiveMetadata(ref);
            // Only directives/components with selectors get added to the scope.
            if (metadata != null) {
                directives.set(metadata.selector, Object.assign({}, metadata, { directive: ref }));
                return;
            }
            const name = this.lookupPipeName(node);
            if (name != null) {
                pipes.set(name, ref);
            }
        });
        const scope = { directives, pipes };
        // Many components may be compiled in the same scope, so cache it.
        this._compilationScopeCache.set(node, scope);
        // Convert References to Expressions in the context of the component's source file.
        return scope;
    }
    /**
     * Produce the compilation scope of a component, which is determined by the module that declares
     * it.
     */
    lookupCompilationScope(node) {
        const scope = this.lookupCompilationScopeAsRefs(node);
        return scope !== null ? convertScopeToExpressions(scope, node) : null;
    }
    lookupScopesOrDie(node, ngModuleImportedFrom) {
        const result = this.lookupScopes(node, ngModuleImportedFrom);
        if (result === null) {
            throw new Error(`Module not found: ${reflector_1.reflectNameOfDeclaration(node)}`);
        }
        return result;
    }
    /**
     * Lookup `SelectorScopes` for a given module.
     *
     * This function assumes that if the given module was imported from an absolute path
     * (`ngModuleImportedFrom`) then all of its declarations are exported at that same path, as well
     * as imports and exports from other modules that are relatively imported.
     */
    lookupScopes(node, ngModuleImportedFrom) {
        let data = null;
        // Either this module was analyzed directly, or has a precompiled ngModuleDef.
        if (this._moduleToData.has(node)) {
            // The module was analyzed before, and thus its data is available.
            data = this._moduleToData.get(node);
        }
        else {
            // The module wasn't analyzed before, and probably has a precompiled ngModuleDef with a type
            // annotation that specifies the needed metadata.
            data = this._readModuleDataFromCompiledClass(node, ngModuleImportedFrom);
            // Note that data here could still be null, if the class didn't have a precompiled
            // ngModuleDef.
        }
        if (data === null) {
            return null;
        }
        return {
            compilation: [
                ...data.declarations,
                // Expand imports to the exported scope of those imports.
                ...flatten(data.imports.map(ref => this.lookupScopesOrDie(ref.node, absoluteModuleName(ref))
                    .exported)),
                // And include the compilation scope of exported modules.
                ...flatten(data.exports
                    .map(ref => this.lookupScopes(ref.node, absoluteModuleName(ref)))
                    .filter((scope) => scope !== null)
                    .map(scope => scope.exported))
            ],
            exported: flatten(data.exports.map(ref => {
                const scope = this.lookupScopes(ref.node, absoluteModuleName(ref));
                if (scope !== null) {
                    return scope.exported;
                }
                else {
                    return [ref];
                }
            })),
        };
    }
    /**
     * Lookup the metadata of a component or directive class.
     *
     * Potentially this class is declared in a .d.ts file or otherwise has a manually created
     * ngComponentDef/ngDirectiveDef. In this case, the type metadata of that definition is read
     * to determine the metadata.
     */
    lookupDirectiveMetadata(ref) {
        const node = ts.getOriginalNode(ref.node);
        if (this._directiveToMetadata.has(node)) {
            return this._directiveToMetadata.get(node);
        }
        else {
            return this._readMetadataFromCompiledClass(ref);
        }
    }
    lookupPipeName(node) {
        if (this._pipeToName.has(node)) {
            return this._pipeToName.get(node);
        }
        else {
            return this._readNameFromCompiledClass(node);
        }
    }
    /**
     * Read the metadata from a class that has already been compiled somehow (either it's in a .d.ts
     * file, or in a .ts file with a handwritten definition).
     *
     * @param clazz the class of interest
     * @param ngModuleImportedFrom module specifier of the import path to assume for all declarations
     * stemming from this module.
     */
    _readModuleDataFromCompiledClass(clazz, ngModuleImportedFrom) {
        // This operation is explicitly not memoized, as it depends on `ngModuleImportedFrom`.
        // TODO(alxhub): investigate caching of .d.ts module metadata.
        const ngModuleDef = this.reflector.getMembersOfClass(clazz).find(member => member.name === 'ngModuleDef' && member.isStatic);
        if (ngModuleDef === undefined) {
            return null;
        }
        else if (
        // Validate that the shape of the ngModuleDef type is correct.
        ngModuleDef.type === null || !ts.isTypeReferenceNode(ngModuleDef.type) ||
            ngModuleDef.type.typeArguments === undefined ||
            ngModuleDef.type.typeArguments.length !== 4) {
            return null;
        }
        // Read the ModuleData out of the type arguments.
        const [_, declarationMetadata, importMetadata, exportMetadata] = ngModuleDef.type.typeArguments;
        return {
            declarations: this._extractReferencesFromType(declarationMetadata, ngModuleImportedFrom),
            exports: this._extractReferencesFromType(exportMetadata, ngModuleImportedFrom),
            imports: this._extractReferencesFromType(importMetadata, ngModuleImportedFrom),
        };
    }
    /**
     * Get the selector from type metadata for a class with a precompiled ngComponentDef or
     * ngDirectiveDef.
     */
    _readMetadataFromCompiledClass(ref) {
        const clazz = ts.getOriginalNode(ref.node);
        const def = this.reflector.getMembersOfClass(clazz).find(field => field.isStatic && (field.name === 'ngComponentDef' || field.name === 'ngDirectiveDef'));
        if (def === undefined) {
            // No definition could be found.
            return null;
        }
        else if (def.type === null || !ts.isTypeReferenceNode(def.type) ||
            def.type.typeArguments === undefined || def.type.typeArguments.length < 2) {
            // The type metadata was the wrong shape.
            return null;
        }
        const selector = readStringType(def.type.typeArguments[1]);
        if (selector === null) {
            return null;
        }
        return Object.assign({ ref, name: clazz.name.text, directive: ref, isComponent: def.name === 'ngComponentDef', selector, exportAs: readStringType(def.type.typeArguments[2]), inputs: readStringMapType(def.type.typeArguments[3]), outputs: readStringMapType(def.type.typeArguments[4]), queries: readStringArrayType(def.type.typeArguments[5]) }, util_1.extractDirectiveGuards(clazz, this.reflector));
    }
    /**
     * Get the selector from type metadata for a class with a precompiled ngComponentDef or
     * ngDirectiveDef.
     */
    _readNameFromCompiledClass(clazz) {
        const def = this.reflector.getMembersOfClass(clazz).find(field => field.isStatic && field.name === 'ngPipeDef');
        if (def === undefined) {
            // No definition could be found.
            return null;
        }
        else if (def.type === null || !ts.isTypeReferenceNode(def.type) ||
            def.type.typeArguments === undefined || def.type.typeArguments.length < 2) {
            // The type metadata was the wrong shape.
            return null;
        }
        const type = def.type.typeArguments[1];
        if (!ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) {
            // The type metadata was the wrong type.
            return null;
        }
        return type.literal.text;
    }
    /**
     * Process a `TypeNode` which is a tuple of references to other types, and return `Reference`s to
     * them.
     *
     * This operation assumes that these types should be imported from `ngModuleImportedFrom` unless
     * they themselves were imported from another absolute path.
     */
    _extractReferencesFromType(def, ngModuleImportedFrom) {
        if (!ts.isTupleTypeNode(def)) {
            return [];
        }
        return def.elementTypes.map(element => {
            if (!ts.isTypeQueryNode(element)) {
                throw new Error(`Expected TypeQueryNode`);
            }
            const type = element.exprName;
            if (ngModuleImportedFrom !== null) {
                const { node, from } = metadata_1.reflectTypeEntityToDeclaration(type, this.checker);
                const moduleName = (from !== null && !from.startsWith('.') ? from : ngModuleImportedFrom);
                const id = reflector_1.reflectIdentifierOfDeclaration(node);
                return new metadata_1.AbsoluteReference(node, id, moduleName, id.text);
            }
            else {
                const { node } = metadata_1.reflectTypeEntityToDeclaration(type, this.checker);
                const id = reflector_1.reflectIdentifierOfDeclaration(node);
                return new metadata_1.ResolvedReference(node, id);
            }
        });
    }
}
exports.SelectorScopeRegistry = SelectorScopeRegistry;
function flatten(array) {
    return array.reduce((accum, subArray) => {
        accum.push(...subArray);
        return accum;
    }, []);
}
function absoluteModuleName(ref) {
    if (!(ref instanceof metadata_1.AbsoluteReference)) {
        return null;
    }
    return ref.moduleName;
}
function convertDirectiveReferenceMap(map, context) {
    const newMap = new Map();
    map.forEach((meta, selector) => {
        const directive = meta.directive.toExpression(context);
        if (directive === null) {
            throw new Error(`Could not write expression to reference ${meta.directive.node}`);
        }
        newMap.set(selector, Object.assign({}, meta, { directive }));
    });
    return newMap;
}
function convertPipeReferenceMap(map, context) {
    const newMap = new Map();
    map.forEach((meta, selector) => {
        const pipe = meta.toExpression(context);
        if (pipe === null) {
            throw new Error(`Could not write expression to reference ${meta.node}`);
        }
        newMap.set(selector, pipe);
    });
    return newMap;
}
function convertScopeToExpressions(scope, context) {
    const sourceContext = ts.getOriginalNode(context).getSourceFile();
    const directives = convertDirectiveReferenceMap(scope.directives, sourceContext);
    const pipes = convertPipeReferenceMap(scope.pipes, sourceContext);
    const declPointer = maybeUnwrapNameOfDeclaration(context);
    let containsForwardDecls = false;
    directives.forEach(expr => {
        containsForwardDecls = containsForwardDecls ||
            isExpressionForwardReference(expr.directive, declPointer, sourceContext);
    });
    !containsForwardDecls && pipes.forEach(expr => {
        containsForwardDecls =
            containsForwardDecls || isExpressionForwardReference(expr, declPointer, sourceContext);
    });
    return { directives, pipes, containsForwardDecls };
}
function isExpressionForwardReference(expr, context, contextSource) {
    if (isWrappedTsNodeExpr(expr)) {
        const node = ts.getOriginalNode(expr.node);
        return node.getSourceFile() === contextSource && context.pos < node.pos;
    }
    return false;
}
function isWrappedTsNodeExpr(expr) {
    return expr instanceof compiler_1.WrappedNodeExpr;
}
function maybeUnwrapNameOfDeclaration(decl) {
    if ((ts.isClassDeclaration(decl) || ts.isVariableDeclaration(decl)) && decl.name !== undefined &&
        ts.isIdentifier(decl.name)) {
        return decl.name;
    }
    return decl;
}
function readStringType(type) {
    if (!ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) {
        return null;
    }
    return type.literal.text;
}
function readStringMapType(type) {
    if (!ts.isTypeLiteralNode(type)) {
        return {};
    }
    const obj = {};
    type.members.forEach(member => {
        if (!ts.isPropertySignature(member) || member.type === undefined || member.name === undefined ||
            !ts.isStringLiteral(member.name)) {
            return;
        }
        const value = readStringType(member.type);
        if (value === null) {
            return null;
        }
        obj[member.name.text] = value;
    });
    return obj;
}
function readStringArrayType(type) {
    if (!ts.isTupleTypeNode(type)) {
        return [];
    }
    const res = [];
    type.elementTypes.forEach(el => {
        if (!ts.isLiteralTypeNode(el) || !ts.isStringLiteral(el.literal)) {
            return;
        }
        res.push(el.literal.text);
    });
    return res;
}
//# sourceMappingURL=selector_scope.js.map