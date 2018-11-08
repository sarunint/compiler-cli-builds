"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
/**
 * `ResourceLoader` which delegates to a `CompilerHost` resource loading method.
 */
class HostResourceLoader {
    constructor(host) {
        this.host = host;
        this.cache = new Map();
        this.fetching = new Set();
    }
    preload(url) {
        if (this.cache.has(url) || this.fetching.has(url)) {
            return undefined;
        }
        const result = this.host(url);
        if (typeof result === 'string') {
            this.cache.set(url, result);
            return undefined;
        }
        else {
            this.fetching.add(url);
            return result.then(str => {
                this.fetching.delete(url);
                this.cache.set(url, str);
            });
        }
    }
    load(url) {
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }
        const result = this.host(url);
        if (typeof result !== 'string') {
            throw new Error(`HostResourceLoader: host(${url}) returned a Promise`);
        }
        this.cache.set(url, result);
        return result;
    }
}
exports.HostResourceLoader = HostResourceLoader;
/**
 * `ResourceLoader` which directly uses the filesystem to resolve resources synchronously.
 */
class FileResourceLoader {
    load(url) { return fs.readFileSync(url, 'utf8'); }
}
exports.FileResourceLoader = FileResourceLoader;
//# sourceMappingURL=resource_loader.js.map