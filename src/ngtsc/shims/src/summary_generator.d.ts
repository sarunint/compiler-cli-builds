/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ts from 'typescript';
import { ShimGenerator } from './host';
export declare class SummaryGenerator implements ShimGenerator {
    private map;
    private constructor();
    getSummaryFileNames(): string[];
    getOriginalSourceOfShim(fileName: string): string | null;
    generate(original: ts.SourceFile, genFilePath: string): ts.SourceFile;
    static forRootFiles(files: ReadonlyArray<string>): SummaryGenerator;
}
