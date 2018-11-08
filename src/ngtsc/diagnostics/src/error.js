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
class FatalDiagnosticError {
    constructor(code, node, message) {
        this.code = code;
        this.node = node;
        this.message = message;
        /**
         * @internal
         */
        this._isFatalDiagnosticError = true;
    }
    toDiagnostic() {
        const node = ts.getOriginalNode(this.node);
        return {
            category: ts.DiagnosticCategory.Error,
            code: Number('-99' + this.code.valueOf()),
            file: ts.getOriginalNode(this.node).getSourceFile(),
            start: node.getStart(undefined, false),
            length: node.getWidth(),
            messageText: this.message,
        };
    }
}
exports.FatalDiagnosticError = FatalDiagnosticError;
function isFatalDiagnosticError(err) {
    return err._isFatalDiagnosticError === true;
}
exports.isFatalDiagnosticError = isFatalDiagnosticError;
//# sourceMappingURL=error.js.map