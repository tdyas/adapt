/*
 * Copyright 2019 Unbounded Systems, LLC
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

import {
    Action as PluginAction,
    ChangeType,
    domDiff,
    DomDiffIdFunc,
    FinalDomElement,
    Plugin,
    PluginOptions,
    registerPlugin,
} from "@adpt/core";
import { notNull } from "@adpt/utils";
import {
    ActionContext,
    getActionInstance,
    toDetail,
} from "./Action";

export interface ActionObservation {
    type: ChangeType;
    detail: string;
}
export interface ActionObservations {
    [elementId: string]: ActionObservation;
}

// FIXME(mark): The use of componentName here may not be quite sufficient.
// Since it's this ID that matches up Elements from the old and new DOM,
// this indirectly decides whether we either perform a
// delete-old-element plus create-new-element or just an update-new-element.
// So if the Element at a certain ID is replaced with a component of the
// same name (and still same ID), BUT has a different implementation or
// semantics, we won't detect that here.
export const idFunc: DomDiffIdFunc = (el) => `${el.id}:${el.componentName}`;

export class ActionPlugin implements Plugin<ActionObservations> {
    logger?: PluginOptions["logger"];
    dataDir?: string;
    elements = new Map<string, FinalDomElement>();

    async start(options: PluginOptions) {
        if (options.logger == null) throw new Error(`Plugin start called without logger`);
        this.logger = options.logger;
        if (options.dataDir == null) throw new Error(`Plugin start called without dataDir`);
        this.dataDir = options.dataDir;
    }

    async observe(oldDom: FinalDomElement | null, newDom: FinalDomElement | null) {
        const obs: ActionObservations = {};
        const callShould = async (list: Set<FinalDomElement>, op: ChangeType) => {
            for (const el of list) {
                const context = this.context(el);
                const inst = getActionInstance(el);
                if (!inst) continue;
                const id = idFunc(el);
                this.elements.set(id, el);

                const ret = toDetail(await inst.shouldAct(op, context));
                obs[id] = {
                    type: ret.act ? op : ChangeType.none,
                    detail: ret.detail,
                };
            }
        };

        const diff = domDiff(oldDom, newDom, idFunc);

        await callShould(diff.deleted, ChangeType.delete);
        await callShould(diff.added, ChangeType.create);
        await callShould(diff.commonNew, ChangeType.modify);
        return obs;
    }

    analyze(_oldDom: FinalDomElement | null, _newDom: FinalDomElement | null,
        observations: ActionObservations): PluginAction[] {

        // Aggregate all "none" items into one PluginAction
        const noAction: FinalDomElement[] = [];

        const actions: PluginAction[] = Object.keys(observations).map((id) => {
            const obs = observations[id];
            const el = this.elements.get(id);

            if (!el) throw new Error(`Internal error: unable to look up element for ID ${id}`);
            const context = this.context(el);

            if (obs.type === ChangeType.none) {
                noAction.push(el);
                return null;
            }

            const inst = getActionInstance(el);
            if (!inst) throw new Error(`Unexpected error getting Action instance`);

            return {
                type: obs.type,
                detail: obs.detail,
                act: async () => inst.action(obs.type, context),
                changes: [{
                    type: obs.type,
                    detail: obs.detail,
                    element: el,
                }]
            };
        }).filter(notNull);

        if (noAction.length > 0) {
            actions.push({
                type: ChangeType.none,
                detail: "No action required",
                act: async () => {/* */ },
                changes: noAction.map((el) => ({
                    type: ChangeType.none,
                    detail: "No action required",
                    element: el,
                }))
            });
        }
        return actions;
    }

    async finish() {/* */ }

    context(el: FinalDomElement): ActionContext {
        const logger = this.logger;
        const dataDir = this.dataDir;
        if (!logger || !dataDir) throw new Error(`Plugin not initialized correctly`);
        return { buildData: el.buildData, dataDir, logger };
    }
}

export function createActionPlugin() {
    return new ActionPlugin();
}

registerPlugin({
    name: "Action",
    module,
    create: createActionPlugin,
});
