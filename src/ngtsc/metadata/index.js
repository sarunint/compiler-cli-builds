"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="node" />
var reflector_1 = require("./src/reflector");
exports.TypeScriptReflectionHost = reflector_1.TypeScriptReflectionHost;
exports.filterToMembersWithDecorator = reflector_1.filterToMembersWithDecorator;
exports.findMember = reflector_1.findMember;
exports.reflectObjectLiteral = reflector_1.reflectObjectLiteral;
exports.reflectTypeEntityToDeclaration = reflector_1.reflectTypeEntityToDeclaration;
var resolver_1 = require("./src/resolver");
exports.AbsoluteReference = resolver_1.AbsoluteReference;
exports.EnumValue = resolver_1.EnumValue;
exports.ImportMode = resolver_1.ImportMode;
exports.Reference = resolver_1.Reference;
exports.ResolvedReference = resolver_1.ResolvedReference;
exports.isDynamicValue = resolver_1.isDynamicValue;
exports.staticallyResolve = resolver_1.staticallyResolve;
//# sourceMappingURL=index.js.map