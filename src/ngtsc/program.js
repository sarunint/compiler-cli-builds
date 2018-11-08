"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const ts = require("typescript");
const nocollapse_hack_1 = require("../transformers/nocollapse_hack");
const annotations_1 = require("./annotations");
const base_def_1 = require("./annotations/src/base_def");
const metadata_1 = require("./metadata");
const resource_loader_1 = require("./resource_loader");
const shims_1 = require("./shims");
const switch_1 = require("./switch");
const transform_1 = require("./transform");
const typecheck_1 = require("./typecheck");
class NgtscProgram {
    constructor(rootNames, options, host, oldProgram) {
        this.options = options;
        this.compilation = undefined;
        this.factoryToSourceInfo = null;
        this.sourceToFactorySymbols = null;
        this._coreImportsFrom = undefined;
        this._reflector = undefined;
        this._isCore = undefined;
        this.rootDirs = [];
        if (options.rootDirs !== undefined) {
            this.rootDirs.push(...options.rootDirs);
        }
        else if (options.rootDir !== undefined) {
            this.rootDirs.push(options.rootDir);
        }
        else {
            this.rootDirs.push(host.getCurrentDirectory());
        }
        this.closureCompilerEnabled = !!options.annotateForClosureCompiler;
        this.resourceLoader = host.readResource !== undefined ?
            new resource_loader_1.HostResourceLoader(host.readResource.bind(host)) :
            new resource_loader_1.FileResourceLoader();
        const shouldGenerateShims = options.allowEmptyCodegenFiles || false;
        this.host = host;
        let rootFiles = [...rootNames];
        if (shouldGenerateShims) {
            // Summary generation.
            const summaryGenerator = shims_1.SummaryGenerator.forRootFiles(rootNames);
            // Factory generation.
            const factoryGenerator = shims_1.FactoryGenerator.forRootFiles(rootNames);
            const factoryFileMap = factoryGenerator.factoryFileMap;
            this.factoryToSourceInfo = new Map();
            this.sourceToFactorySymbols = new Map();
            factoryFileMap.forEach((sourceFilePath, factoryPath) => {
                const moduleSymbolNames = new Set();
                this.sourceToFactorySymbols.set(sourceFilePath, moduleSymbolNames);
                this.factoryToSourceInfo.set(factoryPath, { sourceFilePath, moduleSymbolNames });
            });
            const factoryFileNames = Array.from(factoryFileMap.keys());
            rootFiles.push(...factoryFileNames, ...summaryGenerator.getSummaryFileNames());
            this.host = new shims_1.GeneratedShimsHostWrapper(host, [summaryGenerator, factoryGenerator]);
        }
        this.tsProgram =
            ts.createProgram(rootFiles, options, this.host, oldProgram && oldProgram.getTsProgram());
    }
    getTsProgram() { return this.tsProgram; }
    getTsOptionDiagnostics(cancellationToken) {
        return this.tsProgram.getOptionsDiagnostics(cancellationToken);
    }
    getNgOptionDiagnostics(cancellationToken) {
        return [];
    }
    getTsSyntacticDiagnostics(sourceFile, cancellationToken) {
        return this.tsProgram.getSyntacticDiagnostics(sourceFile, cancellationToken);
    }
    getNgStructuralDiagnostics(cancellationToken) {
        return [];
    }
    getTsSemanticDiagnostics(sourceFile, cancellationToken) {
        return this.tsProgram.getSemanticDiagnostics(sourceFile, cancellationToken);
    }
    getNgSemanticDiagnostics(fileName, cancellationToken) {
        const compilation = this.ensureAnalyzed();
        const diagnostics = [...compilation.diagnostics];
        if (!!this.options.fullTemplateTypeCheck) {
            const ctx = new typecheck_1.TypeCheckContext();
            compilation.typeCheck(ctx);
            diagnostics.push(...this.compileTypeCheckProgram(ctx));
        }
        return diagnostics;
    }
    loadNgStructureAsync() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this.compilation === undefined) {
                this.compilation = this.makeCompilation();
            }
            yield Promise.all(this.tsProgram.getSourceFiles()
                .filter(file => !file.fileName.endsWith('.d.ts'))
                .map(file => this.compilation.analyzeAsync(file))
                .filter((result) => result !== undefined));
        });
    }
    listLazyRoutes(entryRoute) { return []; }
    getLibrarySummaries() {
        throw new Error('Method not implemented.');
    }
    getEmittedGeneratedFiles() {
        throw new Error('Method not implemented.');
    }
    getEmittedSourceFiles() {
        throw new Error('Method not implemented.');
    }
    ensureAnalyzed() {
        if (this.compilation === undefined) {
            this.compilation = this.makeCompilation();
            this.tsProgram.getSourceFiles()
                .filter(file => !file.fileName.endsWith('.d.ts'))
                .forEach(file => this.compilation.analyzeSync(file));
        }
        return this.compilation;
    }
    emit(opts) {
        const emitCallback = opts && opts.emitCallback || defaultEmitCallback;
        this.ensureAnalyzed();
        // Since there is no .d.ts transformation API, .d.ts files are transformed during write.
        const writeFile = (fileName, data, writeByteOrderMark, onError, sourceFiles) => {
            if (fileName.endsWith('.d.ts')) {
                data = sourceFiles.reduce((data, sf) => this.compilation.transformedDtsFor(sf.fileName, data), data);
            }
            else if (this.closureCompilerEnabled && fileName.endsWith('.ts')) {
                data = nocollapse_hack_1.nocollapseHack(data);
            }
            this.host.writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles);
        };
        const transforms = [transform_1.ivyTransformFactory(this.compilation, this.reflector, this.coreImportsFrom)];
        if (this.factoryToSourceInfo !== null) {
            transforms.push(shims_1.generatedFactoryTransform(this.factoryToSourceInfo, this.coreImportsFrom));
        }
        if (this.isCore) {
            transforms.push(switch_1.ivySwitchTransform);
        }
        // Run the emit, including a custom transformer that will downlevel the Ivy decorators in code.
        const emitResult = emitCallback({
            program: this.tsProgram,
            host: this.host,
            options: this.options,
            emitOnlyDtsFiles: false, writeFile,
            customTransformers: {
                before: transforms,
            },
        });
        return emitResult;
    }
    compileTypeCheckProgram(ctx) {
        const host = new typecheck_1.TypeCheckProgramHost(this.tsProgram, this.host, ctx);
        const auxProgram = ts.createProgram({
            host,
            rootNames: this.tsProgram.getRootFileNames(),
            oldProgram: this.tsProgram,
            options: this.options,
        });
        return auxProgram.getSemanticDiagnostics();
    }
    makeCompilation() {
        const checker = this.tsProgram.getTypeChecker();
        const scopeRegistry = new annotations_1.SelectorScopeRegistry(checker, this.reflector);
        // Set up the IvyCompilation, which manages state for the Ivy transformer.
        const handlers = [
            new base_def_1.BaseDefDecoratorHandler(checker, this.reflector),
            new annotations_1.ComponentDecoratorHandler(checker, this.reflector, scopeRegistry, this.isCore, this.resourceLoader, this.rootDirs),
            new annotations_1.DirectiveDecoratorHandler(checker, this.reflector, scopeRegistry, this.isCore),
            new annotations_1.InjectableDecoratorHandler(this.reflector, this.isCore),
            new annotations_1.NgModuleDecoratorHandler(checker, this.reflector, scopeRegistry, this.isCore),
            new annotations_1.PipeDecoratorHandler(checker, this.reflector, scopeRegistry, this.isCore),
        ];
        return new transform_1.IvyCompilation(handlers, checker, this.reflector, this.coreImportsFrom, this.sourceToFactorySymbols);
    }
    get reflector() {
        if (this._reflector === undefined) {
            this._reflector = new metadata_1.TypeScriptReflectionHost(this.tsProgram.getTypeChecker());
        }
        return this._reflector;
    }
    get coreImportsFrom() {
        if (this._coreImportsFrom === undefined) {
            this._coreImportsFrom = this.isCore && getR3SymbolsFile(this.tsProgram) || null;
        }
        return this._coreImportsFrom;
    }
    get isCore() {
        if (this._isCore === undefined) {
            this._isCore = isAngularCorePackage(this.tsProgram);
        }
        return this._isCore;
    }
}
exports.NgtscProgram = NgtscProgram;
const defaultEmitCallback = ({ program, targetSourceFile, writeFile, cancellationToken, emitOnlyDtsFiles, customTransformers }) => program.emit(targetSourceFile, writeFile, cancellationToken, emitOnlyDtsFiles, customTransformers);
function mergeEmitResults(emitResults) {
    const diagnostics = [];
    let emitSkipped = false;
    const emittedFiles = [];
    for (const er of emitResults) {
        diagnostics.push(...er.diagnostics);
        emitSkipped = emitSkipped || er.emitSkipped;
        emittedFiles.push(...(er.emittedFiles || []));
    }
    return { diagnostics, emitSkipped, emittedFiles };
}
/**
 * Find the 'r3_symbols.ts' file in the given `Program`, or return `null` if it wasn't there.
 */
function getR3SymbolsFile(program) {
    return program.getSourceFiles().find(file => file.fileName.indexOf('r3_symbols.ts') >= 0) || null;
}
/**
 * Determine if the given `Program` is @angular/core.
 */
function isAngularCorePackage(program) {
    // Look for its_just_angular.ts somewhere in the program.
    const r3Symbols = getR3SymbolsFile(program);
    if (r3Symbols === null) {
        return false;
    }
    // Look for the constant ITS_JUST_ANGULAR in that file.
    return r3Symbols.statements.some(stmt => {
        // The statement must be a variable declaration statement.
        if (!ts.isVariableStatement(stmt)) {
            return false;
        }
        // It must be exported.
        if (stmt.modifiers === undefined ||
            !stmt.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
            return false;
        }
        // It must declare ITS_JUST_ANGULAR.
        return stmt.declarationList.declarations.some(decl => {
            // The declaration must match the name.
            if (!ts.isIdentifier(decl.name) || decl.name.text !== 'ITS_JUST_ANGULAR') {
                return false;
            }
            // It must initialize the variable to true.
            if (decl.initializer === undefined || decl.initializer.kind !== ts.SyntaxKind.TrueKeyword) {
                return false;
            }
            // This definition matches.
            return true;
        });
    });
}
//# sourceMappingURL=program.js.map