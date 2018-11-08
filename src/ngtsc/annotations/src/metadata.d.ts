/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { Statement } from '@angular/compiler';
import * as ts from 'typescript';
import { ReflectionHost } from '../../host';
/**
 * Given a class declaration, generate a call to `setClassMetadata` with the Angular metadata
 * present on the class or its member fields.
 *
 * If no such metadata is present, this function returns `null`. Otherwise, the call is returned
 * as a `Statement` for inclusion along with the class.
 */
export declare function generateSetClassMetadataCall(clazz: ts.Declaration, reflection: ReflectionHost, isCore: boolean): Statement | null;
