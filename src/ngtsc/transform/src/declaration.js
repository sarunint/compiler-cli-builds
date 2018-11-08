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
const translator_1 = require("../../translator");
/**
 * Processes .d.ts file text and adds static field declarations, with types.
 */
class DtsFileTransformer {
    constructor(coreImportsFrom, importPrefix) {
        this.coreImportsFrom = coreImportsFrom;
        this.ivyFields = new Map();
        this.imports = new translator_1.ImportManager(coreImportsFrom !== null, importPrefix);
    }
    /**
     * Track that a static field was added to the code for a class.
     */
    recordStaticField(name, decls) { this.ivyFields.set(name, decls); }
    /**
     * Process the .d.ts text for a file and add any declarations which were recorded.
     */
    transform(dts, tsPath) {
        const dtsFile = ts.createSourceFile('out.d.ts', dts, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
        for (let i = dtsFile.statements.length - 1; i >= 0; i--) {
            const stmt = dtsFile.statements[i];
            if (ts.isClassDeclaration(stmt) && stmt.name !== undefined &&
                this.ivyFields.has(stmt.name.text)) {
                const decls = this.ivyFields.get(stmt.name.text);
                const before = dts.substring(0, stmt.end - 1);
                const after = dts.substring(stmt.end - 1);
                dts = before +
                    decls
                        .map(decl => {
                        const type = translator_1.translateType(decl.type, this.imports);
                        return `    static ${decl.name}: ${type};\n`;
                    })
                        .join('') +
                    after;
            }
        }
        const imports = this.imports.getAllImports(tsPath, this.coreImportsFrom);
        if (imports.length !== 0) {
            dts = imports.map(i => `import * as ${i.as} from '${i.name}';\n`).join('') + dts;
        }
        return dts;
    }
}
exports.DtsFileTransformer = DtsFileTransformer;
//# sourceMappingURL=declaration.js.map