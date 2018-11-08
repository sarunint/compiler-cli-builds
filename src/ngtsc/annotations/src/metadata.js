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
/**
 * Given a class declaration, generate a call to `setClassMetadata` with the Angular metadata
 * present on the class or its member fields.
 *
 * If no such metadata is present, this function returns `null`. Otherwise, the call is returned
 * as a `Statement` for inclusion along with the class.
 */
function generateSetClassMetadataCall(clazz, reflection, isCore) {
    // Classes come in two flavors, class declarations (ES2015) and variable declarations (ES5).
    // Both must have a declared name to have metadata set on them.
    if ((!ts.isClassDeclaration(clazz) && !ts.isVariableDeclaration(clazz)) ||
        clazz.name === undefined || !ts.isIdentifier(clazz.name)) {
        return null;
    }
    const id = ts.updateIdentifier(clazz.name);
    // Reflect over the class decorators. If none are present, or those that are aren't from
    // Angular, then return null. Otherwise, turn them into metadata.
    const classDecorators = reflection.getDecoratorsOfDeclaration(clazz);
    if (classDecorators === null) {
        return null;
    }
    const ngClassDecorators = classDecorators.filter(dec => isAngularDecorator(dec, isCore)).map(decoratorToMetadata);
    if (ngClassDecorators.length === 0) {
        return null;
    }
    const metaDecorators = ts.createArrayLiteral(ngClassDecorators);
    // Convert the constructor parameters to metadata, passing null if none are present.
    let metaCtorParameters = ts.createNull();
    const classCtorParameters = reflection.getConstructorParameters(clazz);
    if (classCtorParameters !== null) {
        metaCtorParameters = ts.createArrayLiteral(classCtorParameters.map(param => ctorParameterToMetadata(param, isCore)));
    }
    // Do the same for property decorators.
    let metaPropDecorators = ts.createNull();
    const decoratedMembers = reflection.getMembersOfClass(clazz)
        .filter(member => !member.isStatic && member.decorators !== null)
        .map(member => classMemberToMetadata(member.name, member.decorators, isCore));
    if (decoratedMembers.length > 0) {
        metaPropDecorators = ts.createObjectLiteral(decoratedMembers);
    }
    // Generate a pure call to setClassMetadata with the class identifier and its metadata.
    const setClassMetadata = new compiler_1.ExternalExpr(compiler_1.Identifiers.setClassMetadata);
    const fnCall = new compiler_1.InvokeFunctionExpr(
    /* fn */ setClassMetadata, 
    /* args */
    [
        new compiler_1.WrappedNodeExpr(id),
        new compiler_1.WrappedNodeExpr(metaDecorators),
        new compiler_1.WrappedNodeExpr(metaCtorParameters),
        new compiler_1.WrappedNodeExpr(metaPropDecorators),
    ], 
    /* type */ undefined, 
    /* sourceSpan */ undefined, 
    /* pure */ true);
    return fnCall.toStmt();
}
exports.generateSetClassMetadataCall = generateSetClassMetadataCall;
/**
 * Convert a reflected constructor parameter to metadata.
 */
function ctorParameterToMetadata(param, isCore) {
    // Parameters sometimes have a type that can be referenced. If so, then use it, otherwise
    // its type is undefined.
    const type = param.type !== null ? param.type : ts.createIdentifier('undefined');
    const properties = [
        ts.createPropertyAssignment('type', type),
    ];
    // If the parameter has decorators, include the ones from Angular.
    if (param.decorators !== null) {
        const ngDecorators = param.decorators.filter(dec => isAngularDecorator(dec, isCore)).map(decoratorToMetadata);
        properties.push(ts.createPropertyAssignment('decorators', ts.createArrayLiteral(ngDecorators)));
    }
    return ts.createObjectLiteral(properties, true);
}
/**
 * Convert a reflected class member to metadata.
 */
function classMemberToMetadata(name, decorators, isCore) {
    const ngDecorators = decorators.filter(dec => isAngularDecorator(dec, isCore)).map(decoratorToMetadata);
    const decoratorMeta = ts.createArrayLiteral(ngDecorators);
    return ts.createPropertyAssignment(name, decoratorMeta);
}
/**
 * Convert a reflected decorator to metadata.
 */
function decoratorToMetadata(decorator) {
    // Decorators have a type.
    const properties = [
        ts.createPropertyAssignment('type', ts.updateIdentifier(decorator.identifier)),
    ];
    // Sometimes they have arguments.
    if (decorator.args !== null && decorator.args.length > 0) {
        const args = decorator.args.map(arg => ts.getMutableClone(arg));
        properties.push(ts.createPropertyAssignment('args', ts.createArrayLiteral(args)));
    }
    return ts.createObjectLiteral(properties, true);
}
/**
 * Whether a given decorator should be treated as an Angular decorator.
 *
 * Either it's used in @angular/core, or it's imported from there.
 */
function isAngularDecorator(decorator, isCore) {
    return isCore || (decorator.import !== null && decorator.import.from === '@angular/core');
}
//# sourceMappingURL=metadata.js.map