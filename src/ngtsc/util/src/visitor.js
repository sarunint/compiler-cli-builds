"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
/**
 * Visit a node with the given visitor and return a transformed copy.
 */
function visit(node, visitor, context) {
    return visitor._visit(node, context);
}
exports.visit = visit;
/**
 * Abstract base class for visitors, which processes certain nodes specially to allow insertion
 * of other nodes before them.
 */
class Visitor {
    constructor() {
        /**
         * Maps statements to an array of statements that should be inserted before them.
         */
        this._before = new Map();
        /**
         * Maps statements to an array of statements that should be inserted after them.
         */
        this._after = new Map();
    }
    /**
     * Visit a class declaration, returning at least the transformed declaration and optionally other
     * nodes to insert before the declaration.
     */
    visitClassDeclaration(node) {
        return { node };
    }
    _visitListEntryNode(node, visitor) {
        const result = visitor(node);
        if (result.before !== undefined) {
            // Record that some nodes should be inserted before the given declaration. The declaration's
            // parent's _visit call is responsible for performing this insertion.
            this._before.set(result.node, result.before);
        }
        if (result.after !== undefined) {
            // Same with nodes that should be inserted after.
            this._after.set(result.node, result.after);
        }
        return result.node;
    }
    /**
     * Visit types of nodes which don't have their own explicit visitor.
     */
    visitOtherNode(node) { return node; }
    /**
     * @internal
     */
    _visit(node, context) {
        // First, visit the node. visitedNode starts off as `null` but should be set after visiting
        // is completed.
        let visitedNode = null;
        node = ts.visitEachChild(node, child => this._visit(child, context), context);
        if (ts.isClassDeclaration(node)) {
            visitedNode = this._visitListEntryNode(node, (node) => this.visitClassDeclaration(node));
        }
        else {
            visitedNode = this.visitOtherNode(node);
        }
        // If the visited node has a `statements` array then process them, maybe replacing the visited
        // node and adding additional statements.
        if (hasStatements(visitedNode)) {
            visitedNode = this._maybeProcessStatements(visitedNode);
        }
        return visitedNode;
    }
    _maybeProcessStatements(node) {
        // Shortcut - if every statement doesn't require nodes to be prepended or appended,
        // this is a no-op.
        if (node.statements.every(stmt => !this._before.has(stmt) && !this._after.has(stmt))) {
            return node;
        }
        // There are statements to prepend, so clone the original node.
        const clone = ts.getMutableClone(node);
        // Build a new list of statements and patch it onto the clone.
        const newStatements = [];
        clone.statements.forEach(stmt => {
            if (this._before.has(stmt)) {
                newStatements.push(...this._before.get(stmt));
                this._before.delete(stmt);
            }
            newStatements.push(stmt);
            if (this._after.has(stmt)) {
                newStatements.push(...this._after.get(stmt));
                this._after.delete(stmt);
            }
        });
        clone.statements = ts.createNodeArray(newStatements, node.statements.hasTrailingComma);
        return clone;
    }
}
exports.Visitor = Visitor;
function hasStatements(node) {
    const block = node;
    return block.statements !== undefined && Array.isArray(block.statements);
}
//# sourceMappingURL=visitor.js.map