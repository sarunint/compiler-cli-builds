"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * A wrapper around a `ts.CompilerHost` which supports generated files.
 */
class GeneratedShimsHostWrapper {
    constructor(delegate, shimGenerators) {
        this.delegate = delegate;
        this.shimGenerators = shimGenerators;
        if (delegate.resolveTypeReferenceDirectives) {
            this.resolveTypeReferenceDirectives = (names, containingFile) => delegate.resolveTypeReferenceDirectives(names, containingFile);
        }
    }
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
        const canonical = this.getCanonicalFileName(fileName);
        for (let i = 0; i < this.shimGenerators.length; i++) {
            const generator = this.shimGenerators[i];
            const originalFile = generator.getOriginalSourceOfShim(canonical);
            if (originalFile !== null) {
                // This shim generator has recognized the filename being requested, and is now responsible
                // for generating its contents, based on the contents of the original file it has requested.
                const originalSource = this.delegate.getSourceFile(originalFile, languageVersion, onError, shouldCreateNewSourceFile);
                if (originalSource === undefined) {
                    // The original requested file doesn't exist, so the shim cannot exist either.
                    return undefined;
                }
                return generator.generate(originalSource, fileName);
            }
        }
        return this.delegate.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    }
    getDefaultLibFileName(options) {
        return this.delegate.getDefaultLibFileName(options);
    }
    writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles) {
        return this.delegate.writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles);
    }
    getCurrentDirectory() { return this.delegate.getCurrentDirectory(); }
    getDirectories(path) { return this.delegate.getDirectories(path); }
    getCanonicalFileName(fileName) {
        return this.delegate.getCanonicalFileName(fileName);
    }
    useCaseSensitiveFileNames() { return this.delegate.useCaseSensitiveFileNames(); }
    getNewLine() { return this.delegate.getNewLine(); }
    fileExists(fileName) {
        const canonical = this.getCanonicalFileName(fileName);
        // Consider the file as existing whenever 1) it really does exist in the delegate host, or
        // 2) at least one of the shim generators recognizes it.
        return this.delegate.fileExists(fileName) ||
            this.shimGenerators.some(gen => gen.getOriginalSourceOfShim(canonical) !== null);
    }
    readFile(fileName) { return this.delegate.readFile(fileName); }
}
exports.GeneratedShimsHostWrapper = GeneratedShimsHostWrapper;
//# sourceMappingURL=host.js.map