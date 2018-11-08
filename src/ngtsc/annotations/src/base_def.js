"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const compiler_1 = require("@angular/compiler");
const metadata_1 = require("../../metadata");
const util_1 = require("./util");
function containsNgTopLevelDecorator(decorators) {
    if (!decorators) {
        return false;
    }
    return decorators.find(decorator => (decorator.name === 'Component' || decorator.name === 'Directive' ||
        decorator.name === 'NgModule') &&
        util_1.isAngularCore(decorator)) !== undefined;
}
class BaseDefDecoratorHandler {
    constructor(checker, reflector) {
        this.checker = checker;
        this.reflector = reflector;
    }
    detect(node, decorators) {
        if (containsNgTopLevelDecorator(decorators)) {
            // If the class is already decorated by @Component or @Directive let that
            // DecoratorHandler handle this. BaseDef is unnecessary.
            return undefined;
        }
        let result = undefined;
        this.reflector.getMembersOfClass(node).forEach(property => {
            const { decorators } = property;
            if (decorators) {
                for (const decorator of decorators) {
                    const decoratorName = decorator.name;
                    if (decoratorName === 'Input' && util_1.isAngularCore(decorator)) {
                        result = result || {};
                        const inputs = result.inputs = result.inputs || [];
                        inputs.push({ decorator, property });
                    }
                    else if (decoratorName === 'Output' && util_1.isAngularCore(decorator)) {
                        result = result || {};
                        const outputs = result.outputs = result.outputs || [];
                        outputs.push({ decorator, property });
                    }
                }
            }
        });
        return result;
    }
    analyze(node, metadata) {
        const analysis = {};
        if (metadata.inputs) {
            const inputs = analysis.inputs = {};
            metadata.inputs.forEach(({ decorator, property }) => {
                const propName = property.name;
                const args = decorator.args;
                let value;
                if (args && args.length > 0) {
                    const resolvedValue = metadata_1.staticallyResolve(args[0], this.reflector, this.checker);
                    if (typeof resolvedValue !== 'string') {
                        throw new TypeError('Input alias does not resolve to a string value');
                    }
                    value = [resolvedValue, propName];
                }
                else {
                    value = propName;
                }
                inputs[propName] = value;
            });
        }
        if (metadata.outputs) {
            const outputs = analysis.outputs = {};
            metadata.outputs.forEach(({ decorator, property }) => {
                const propName = property.name;
                const args = decorator.args;
                let value;
                if (args && args.length > 0) {
                    const resolvedValue = metadata_1.staticallyResolve(args[0], this.reflector, this.checker);
                    if (typeof resolvedValue !== 'string') {
                        throw new TypeError('Output alias does not resolve to a string value');
                    }
                    value = resolvedValue;
                }
                else {
                    value = propName;
                }
                outputs[propName] = value;
            });
        }
        return { analysis };
    }
    compile(node, analysis) {
        const { expression, type } = compiler_1.compileBaseDefFromMetadata(analysis);
        return {
            name: 'ngBaseDef',
            initializer: expression, type,
            statements: [],
        };
    }
}
exports.BaseDefDecoratorHandler = BaseDefDecoratorHandler;
//# sourceMappingURL=base_def.js.map