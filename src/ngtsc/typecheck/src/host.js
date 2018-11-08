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
 * A `ts.CompilerHost` which augments source files with type checking code from a
 * `TypeCheckContext`.
 */
class TypeCheckProgramHost {
    constructor(program, delegate, context) {
        this.delegate = delegate;
        this.context = context;
        /**
         * Map of source file names to `ts.SourceFile` instances.
         *
         * This is prepopulated with all the old source files, and updated as files are augmented.
         */
        this.sfCache = new Map();
        /**
         * Tracks those files in `sfCache` which have been augmented with type checking information
         * already.
         */
        this.augmentedSourceFiles = new Set();
        // The `TypeCheckContext` uses object identity for `ts.SourceFile`s to track which files need
        // type checking code inserted. Additionally, the operation of getting a source file should be
        // as efficient as possible. To support both of these requirements, all of the program's
        // source files are loaded into the cache up front.
        program.getSourceFiles().forEach(file => { this.sfCache.set(file.fileName, file); });
    }
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
        // Look in the cache for the source file.
        let sf = this.sfCache.get(fileName);
        if (sf === undefined) {
            // There should be no cache misses, but just in case, delegate getSourceFile in the event of
            // a cache miss.
            sf = this.delegate.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
            sf && this.sfCache.set(fileName, sf);
        }
        if (sf !== undefined) {
            // Maybe augment the file with type checking code via the `TypeCheckContext`.
            if (!this.augmentedSourceFiles.has(sf)) {
                sf = this.context.transform(sf);
                this.sfCache.set(fileName, sf);
                this.augmentedSourceFiles.add(sf);
            }
            return sf;
        }
        else {
            return undefined;
        }
    }
    // The rest of the methods simply delegate to the underlying `ts.CompilerHost`.
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
    fileExists(fileName) { return this.delegate.fileExists(fileName); }
    readFile(fileName) { return this.delegate.readFile(fileName); }
}
exports.TypeCheckProgramHost = TypeCheckProgramHost;
//# sourceMappingURL=host.js.map