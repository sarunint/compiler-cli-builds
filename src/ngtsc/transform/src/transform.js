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
const translator_1 = require("../../translator");
const visitor_1 = require("../../util/src/visitor");
const NO_DECORATORS = new Set();
function ivyTransformFactory(compilation, reflector, coreImportsFrom) {
    return (context) => {
        return (file) => {
            return transformIvySourceFile(compilation, context, reflector, coreImportsFrom, file);
        };
    };
}
exports.ivyTransformFactory = ivyTransformFactory;
class IvyVisitor extends visitor_1.Visitor {
    constructor(compilation, reflector, importManager, isCore, constantPool) {
        super();
        this.compilation = compilation;
        this.reflector = reflector;
        this.importManager = importManager;
        this.isCore = isCore;
        this.constantPool = constantPool;
    }
    visitClassDeclaration(node) {
        // Determine if this class has an Ivy field that needs to be added, and compile the field
        // to an expression if so.
        const res = this.compilation.compileIvyFieldFor(node, this.constantPool);
        if (res !== undefined) {
            // There is at least one field to add.
            const statements = [];
            const members = [...node.members];
            res.forEach(field => {
                // Translate the initializer for the field into TS nodes.
                const exprNode = translator_1.translateExpression(field.initializer, this.importManager);
                // Create a static property declaration for the new field.
                const property = ts.createProperty(undefined, [ts.createToken(ts.SyntaxKind.StaticKeyword)], field.name, undefined, undefined, exprNode);
                field.statements.map(stmt => translator_1.translateStatement(stmt, this.importManager))
                    .forEach(stmt => statements.push(stmt));
                members.push(property);
            });
            // Replace the class declaration with an updated version.
            node = ts.updateClassDeclaration(node, 
            // Remove the decorator which triggered this compilation, leaving the others alone.
            maybeFilterDecorator(node.decorators, this.compilation.ivyDecoratorFor(node).node), node.modifiers, node.name, node.typeParameters, node.heritageClauses || [], 
            // Map over the class members and remove any Angular decorators from them.
            members.map(member => this._stripAngularDecorators(member)));
            return { node, after: statements };
        }
        return { node };
    }
    /**
     * Return all decorators on a `Declaration` which are from @angular/core, or an empty set if none
     * are.
     */
    _angularCoreDecorators(decl) {
        const decorators = this.reflector.getDecoratorsOfDeclaration(decl);
        if (decorators === null) {
            return NO_DECORATORS;
        }
        const coreDecorators = decorators.filter(dec => this.isCore || isFromAngularCore(dec))
            .map(dec => dec.node);
        if (coreDecorators.length > 0) {
            return new Set(coreDecorators);
        }
        else {
            return NO_DECORATORS;
        }
    }
    /**
     * Given a `ts.Node`, filter the decorators array and return a version containing only non-Angular
     * decorators.
     *
     * If all decorators are removed (or none existed in the first place), this method returns
     * `undefined`.
     */
    _nonCoreDecoratorsOnly(node) {
        // Shortcut if the node has no decorators.
        if (node.decorators === undefined) {
            return undefined;
        }
        // Build a Set of the decorators on this node from @angular/core.
        const coreDecorators = this._angularCoreDecorators(node);
        if (coreDecorators.size === node.decorators.length) {
            // If all decorators are to be removed, return `undefined`.
            return undefined;
        }
        else if (coreDecorators.size === 0) {
            // If no decorators need to be removed, return the original decorators array.
            return node.decorators;
        }
        // Filter out the core decorators.
        const filtered = node.decorators.filter(dec => !coreDecorators.has(dec));
        // If no decorators survive, return `undefined`. This can only happen if a core decorator is
        // repeated on the node.
        if (filtered.length === 0) {
            return undefined;
        }
        // Create a new `NodeArray` with the filtered decorators that sourcemaps back to the original.
        const array = ts.createNodeArray(filtered);
        array.pos = node.decorators.pos;
        array.end = node.decorators.end;
        return array;
    }
    /**
     * Remove Angular decorators from a `ts.Node` in a shallow manner.
     *
     * This will remove decorators from class elements (getters, setters, properties, methods) as well
     * as parameters of constructors.
     */
    _stripAngularDecorators(node) {
        if (ts.isParameter(node)) {
            // Strip decorators from parameters (probably of the constructor).
            node = ts.updateParameter(node, this._nonCoreDecoratorsOnly(node), node.modifiers, node.dotDotDotToken, node.name, node.questionToken, node.type, node.initializer);
        }
        else if (ts.isMethodDeclaration(node) && node.decorators !== undefined) {
            // Strip decorators of methods.
            node = ts.updateMethod(node, this._nonCoreDecoratorsOnly(node), node.modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, node.body);
        }
        else if (ts.isPropertyDeclaration(node) && node.decorators !== undefined) {
            // Strip decorators of properties.
            node = ts.updateProperty(node, this._nonCoreDecoratorsOnly(node), node.modifiers, node.name, node.questionToken, node.type, node.initializer);
        }
        else if (ts.isGetAccessor(node)) {
            // Strip decorators of getters.
            node = ts.updateGetAccessor(node, this._nonCoreDecoratorsOnly(node), node.modifiers, node.name, node.parameters, node.type, node.body);
        }
        else if (ts.isSetAccessor(node)) {
            // Strip decorators of setters.
            node = ts.updateSetAccessor(node, this._nonCoreDecoratorsOnly(node), node.modifiers, node.name, node.parameters, node.body);
        }
        else if (ts.isConstructorDeclaration(node)) {
            // For constructors, strip decorators of the parameters.
            const parameters = node.parameters.map(param => this._stripAngularDecorators(param));
            node =
                ts.updateConstructor(node, node.decorators, node.modifiers, parameters, node.body);
        }
        return node;
    }
}
/**
 * A transformer which operates on ts.SourceFiles and applies changes from an `IvyCompilation`.
 */
function transformIvySourceFile(compilation, context, reflector, coreImportsFrom, file) {
    const constantPool = new compiler_1.ConstantPool();
    const importManager = new translator_1.ImportManager(coreImportsFrom !== null);
    // Recursively scan through the AST and perform any updates requested by the IvyCompilation.
    const visitor = new IvyVisitor(compilation, reflector, importManager, coreImportsFrom !== null, constantPool);
    const sf = visitor_1.visit(file, visitor, context);
    // Generate the constant statements first, as they may involve adding additional imports
    // to the ImportManager.
    const constants = constantPool.statements.map(stmt => translator_1.translateStatement(stmt, importManager));
    // Generate the import statements to prepend.
    const addedImports = importManager.getAllImports(file.fileName, coreImportsFrom).map(i => {
        return ts.createImportDeclaration(undefined, undefined, ts.createImportClause(undefined, ts.createNamespaceImport(ts.createIdentifier(i.as))), ts.createLiteral(i.name));
    });
    // Filter out the existing imports and the source file body. All new statements
    // will be inserted between them.
    const existingImports = sf.statements.filter(stmt => isImportStatement(stmt));
    const body = sf.statements.filter(stmt => !isImportStatement(stmt));
    // Prepend imports if needed.
    if (addedImports.length > 0) {
        sf.statements =
            ts.createNodeArray([...existingImports, ...addedImports, ...constants, ...body]);
    }
    return sf;
}
function maybeFilterDecorator(decorators, toRemove) {
    if (decorators === undefined) {
        return undefined;
    }
    const filtered = decorators.filter(dec => ts.getOriginalNode(dec) !== toRemove);
    if (filtered.length === 0) {
        return undefined;
    }
    return ts.createNodeArray(filtered);
}
function isFromAngularCore(decorator) {
    return decorator.import !== null && decorator.import.from === '@angular/core';
}
function isImportStatement(stmt) {
    return ts.isImportDeclaration(stmt) || ts.isImportEqualsDeclaration(stmt) ||
        ts.isNamespaceImport(stmt);
}
//# sourceMappingURL=transform.js.map