/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ts from 'typescript';
import { ErrorCode } from './code';
export declare class FatalDiagnosticError {
    readonly code: ErrorCode;
    readonly node: ts.Node;
    readonly message: string;
    constructor(code: ErrorCode, node: ts.Node, message: string);
    /**
     * @internal
     */
    _isFatalDiagnosticError: boolean;
    toDiagnostic(): ts.DiagnosticWithLocation;
}
export declare function isFatalDiagnosticError(err: any): err is FatalDiagnosticError;
