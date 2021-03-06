"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
var node_emitter_1 = require("./node_emitter");
var util_1 = require("./util");
var PREAMBLE = "/**\n* @fileoverview This file is generated by the Angular template compiler.\n* Do not edit.\n* @suppress {suspiciousCode,uselessCode,missingProperties,missingOverride}\n* tslint:disable\n*/";
function getAngularEmitterTransformFactory(generatedFiles) {
    return function () {
        var emitter = new node_emitter_1.TypeScriptNodeEmitter();
        return function (sourceFile) {
            var g = generatedFiles.get(sourceFile.fileName);
            if (g && g.stmts) {
                var newSourceFile = emitter.updateSourceFile(sourceFile, g.stmts, PREAMBLE)[0];
                return newSourceFile;
            }
            else if (util_1.GENERATED_FILES.test(sourceFile.fileName)) {
                return ts.updateSourceFileNode(sourceFile, []);
            }
            return sourceFile;
        };
    };
}
exports.getAngularEmitterTransformFactory = getAngularEmitterTransformFactory;
//# sourceMappingURL=node_emitter_transform.js.map