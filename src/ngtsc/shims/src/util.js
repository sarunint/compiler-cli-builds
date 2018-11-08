"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const TS_FILE = /\.tsx?$/;
const D_TS_FILE = /\.d\.ts$/;
function isNonDeclarationTsFile(file) {
    return TS_FILE.exec(file) !== null && D_TS_FILE.exec(file) === null;
}
exports.isNonDeclarationTsFile = isNonDeclarationTsFile;
//# sourceMappingURL=util.js.map