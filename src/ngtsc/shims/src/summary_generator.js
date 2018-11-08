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
const util_1 = require("./util");
class SummaryGenerator {
    constructor(map) {
        this.map = map;
    }
    getSummaryFileNames() { return Array.from(this.map.keys()); }
    getOriginalSourceOfShim(fileName) { return this.map.get(fileName) || null; }
    generate(original, genFilePath) {
        // Collect a list of classes that need to have factory types emitted for them. This list is
        // overly broad as at this point the ts.TypeChecker has not been created and so it can't be used
        // to semantically understand which decorators are Angular decorators. It's okay to output an
        // overly broad set of summary exports as the exports are no-ops anyway, and summaries are a
        // compatibility layer which will be removed after Ivy is enabled.
        const symbolNames = original
            .statements
            // Pick out top level class declarations...
            .filter(ts.isClassDeclaration)
            // which are named, exported, and have decorators.
            .filter(decl => isExported(decl) && decl.decorators !== undefined &&
            decl.name !== undefined)
            // Grab the symbol name.
            .map(decl => decl.name.text);
        const varLines = symbolNames.map(name => `export const ${name}NgSummary: any = null;`);
        if (varLines.length === 0) {
            // In the event there are no other exports, add an empty export to ensure the generated
            // summary file is still an ES module.
            varLines.push(`export const ɵempty = null;`);
        }
        const sourceText = varLines.join('\n');
        return ts.createSourceFile(genFilePath, sourceText, original.languageVersion, true, ts.ScriptKind.TS);
    }
    static forRootFiles(files) {
        const map = new Map();
        files.filter(sourceFile => util_1.isNonDeclarationTsFile(sourceFile))
            .forEach(sourceFile => map.set(sourceFile.replace(/\.ts$/, '.ngsummary.ts'), sourceFile));
        return new SummaryGenerator(map);
    }
}
exports.SummaryGenerator = SummaryGenerator;
function isExported(decl) {
    return decl.modifiers !== undefined &&
        decl.modifiers.some(mod => mod.kind == ts.SyntaxKind.ExportKeyword);
}
//# sourceMappingURL=summary_generator.js.map