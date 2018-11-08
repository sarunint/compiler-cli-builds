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
const path = require("path");
const TS_DTS_EXTENSION = /(\.d)?\.ts$/;
function relativePathBetween(from, to) {
    let relative = path.posix.relative(path.dirname(from), to).replace(TS_DTS_EXTENSION, '');
    if (relative === '') {
        return null;
    }
    // path.relative() does not include the leading './'.
    if (!relative.startsWith('.')) {
        relative = `./${relative}`;
    }
    return relative;
}
exports.relativePathBetween = relativePathBetween;
//# sourceMappingURL=path.js.map