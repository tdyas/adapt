/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import db from "debug";
import * as util from "util";

import * as ld from "lodash";

import { diffObjects } from "@adpt/utils";
import { InternalError } from "./error";
import { AdaptElement, AnyProps, AnyState, isElementImpl, isMountedElement } from "./jsx";

const debugState = db("adapt:state");

export interface StateStore {
    setElementState(elem: StateNamespace, data: AnyState | undefined): void;
    elementState(elem: StateNamespace): AnyState | undefined;
    serialize(): string;
}

function namespaceToKey(ns: StateNamespace): string {
    return JSON.stringify(ns);
}

function keyToNamespace(key: string): StateNamespace {
    try {
        return JSON.parse(key);
    } catch (e) {
        if (ld.isError(e)) {
            throw new Error("Illegal key: " + e.message);
        } else {
            throw new Error("Illegal key");
        }
    }
}

export function createStateStore(json?: string): StateStore {
    const ret = new StateStoreImpl();
    if (json != null) {
        const init = JSON.parse(json);
        for (const key in init) {
            if (!init.hasOwnProperty(key)) continue;

            const ns = keyToNamespace(key);
            const val = init[key];
            if (ld.isObject(val)) {
                ret.setElementState(ns, val);
            } else if (init[key] === undefined) {
                //Do nothing
            } else {
                throw new Error(`Illegal state in store json: ${key} => ${util.inspect(init[key])}`);
            }
        }
    }
    return ret;
}

export type StateNamespace = string[];

class StateStoreImpl implements StateStore {
    states = new Map<string, AnyState>();

    setElementState(elem: StateNamespace, data: AnyState | undefined) {
        const key = namespaceToKey(elem);

        if (debugState.enabled) {
            const prev = this.states.get(key);
            const diff = diffObjects(prev, data);
            if (diff) debugState(`State change for ${elem}:\n${diff}`);
        }

        if (data === undefined) {
            this.states.delete(key);
        } else {
            this.states.set(key, data);
        }
    }

    elementState(elem: StateNamespace): AnyState | undefined {
        return this.states.get(namespaceToKey(elem));
    }

    serialize(): string {
        const ret: AnyState = {};
        this.states.forEach((elem, key) => {
            ret[key] = elem;
        });
        return JSON.stringify(ret);
    }
}

export type StateUpdater<P = AnyProps, S = AnyState> =
    (prev: S, props: P) => Partial<S> | Promise<Partial<S>>;

export async function applyStateUpdates<
    P extends object = AnyProps,
    S extends object = AnyState>(
        path: StateNamespace,
        store: StateStore,
        props: P,
        updaters: StateUpdater<P, S>[]) {

    if (updaters.length === 0) return false;

    const prev: S | undefined = store.elementState(path) as S;
    if (prev === undefined) {
        throw new InternalError(`previous Component state should have been initialized`);
    }

    let newState = prev;
    for (const updater of updaters) {
        // Copy current state so updater can't modify newState
        // https://github.com/Microsoft/TypeScript/pull/13288
        const u = await updater({ ...newState as any }, props);

        newState = { ...newState as any, ...u as any };
    }

    if (ld.isEqual(prev, newState)) return false;
    store.setElementState(path, newState);
    return true;
}

export function stateNamespaceForPath(path: AdaptElement[]): StateNamespace {
    const elem = ld.last(path);
    if (!elem) return [];
    if (!isElementImpl(elem)) throw new Error("Elements must inherit from ElementImpl");
    if (isMountedElement(elem)) {
        return elem.stateNamespace;
    } else {
        throw new Error("Cannot compute state namespace for path with unmounted elements" + util.inspect(path));
    }
}
