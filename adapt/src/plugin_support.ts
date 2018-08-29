import * as ld from "lodash";
import * as path from "path";
import { AdaptElementOrNull } from ".";
import { findPackageInfo } from "./packageinfo";
import { getAdaptContext } from "./ts";
import { Logger } from "./type_support";
import { MessageLogger } from "./utils";

type PluginKey = string;
type RegisteredPlugins = Map<PluginKey, Plugin>;

export interface PluginConfig {
    plugins: RegisteredPlugins;
}

export interface Action {
    description: string;
    act(): Promise<void>;
}

export interface PluginOptions {
    deployID: string;
    log: Logger;
}

export interface Plugin<Observations extends object = object> {
    start(options: PluginOptions): Promise<void>;
    observe(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observations>; //Pull data needed for analyze
    analyze(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observations): Action[];
    finish(): Promise<void>;
}

export interface PluginManagerStartOptions {
    deployID: string;
    logger: MessageLogger;
}

export interface ActionResult {
    action: Action;
    err?: any;
}

export interface PluginManager {
    start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
          options: PluginManagerStartOptions): Promise<void>;
    observe(): Promise<void>;
    analyze(): Action[];
    act(dryRun: boolean): Promise<ActionResult[]>;
    finish(): Promise<void>;
}

export function createPluginManager(config: PluginConfig): PluginManager {
    return new PluginManagerImpl(config);
}

function logError(action: Action, err: any, logger: Logger) {
    logger(`--Error during ${action.description}\n${err}\n----------`);
}

enum PluginManagerState {
    Initial = "Initial",
    Starting = "Starting",
    PreObserve = "PreObserve",
    Observing = "Observing",
    PreAnalyze = "PreAnalyze",
    Analyzing = "Analyzing",
    PreAct = "PreAct",
    Acting = "Acting",
    PreFinish = "PreFinish",
    Finishing = "Finishing"
}

function legalStateTransition(prev: PluginManagerState, next: PluginManagerState): boolean {
    switch (prev) {
        case PluginManagerState.Initial:
            return next === PluginManagerState.Starting;
        case PluginManagerState.Starting:
            return next === PluginManagerState.PreObserve;
        case PluginManagerState.PreObserve:
            return next === PluginManagerState.Observing;
        case PluginManagerState.Observing:
            return next === PluginManagerState.PreAnalyze;
        case PluginManagerState.PreAnalyze:
            return next === PluginManagerState.Analyzing;
        case PluginManagerState.Analyzing:
            return next === PluginManagerState.PreAct;
        case PluginManagerState.PreAct:
            return [
                PluginManagerState.Finishing, // finish without acting
                PluginManagerState.Acting
            ].find((v) => v === next) !== undefined;
        case PluginManagerState.Acting:
            return [
                PluginManagerState.PreAct, //  dryRun
                PluginManagerState.PreFinish  // !dryRun
            ].find((v) => v === next) !== undefined;
        case PluginManagerState.PreFinish:
            return next === PluginManagerState.Finishing;
        case PluginManagerState.Finishing:
            return next === PluginManagerState.Initial;
    }
}

function mapMap<K, V, T>(map: Map<K, V>, f: (key: K, val: V) => T): T[] {
    const ret: T[] = [];
    for (const [k, v] of map.entries()) {
        ret.push(f(k, v));
    }
    return ret;
}

interface AnyObservation {
    [name: string]: any;
}

class PluginManagerImpl implements PluginManager {
    plugins: Map<PluginKey, Plugin>;
    dom?: AdaptElementOrNull;
    prevDom?: AdaptElementOrNull;
    actions?: Action[];
    logger?: MessageLogger;
    state: PluginManagerState;
    observations: AnyObservation;

    constructor(config: PluginConfig) {
        this.plugins = new Map(config.plugins);
        this.state = PluginManagerState.Initial;
    }

    transitionTo(next: PluginManagerState) {
        if (!legalStateTransition(this.state, next)) {
            throw new Error(`Illegal call to Plugin Manager, attempting to go from ${this.state} to ${next}`);
        }
        this.state = next;
    }

    async start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
                options: PluginManagerStartOptions) {
        this.transitionTo(PluginManagerState.Starting);
        this.dom = dom;
        this.prevDom = prevDom;
        this.logger = options.logger;
        this.observations = {};

        const loptions = {
            deployID: options.deployID,
            log: options.logger.info, //FIXME(manishv) have a per-plugin log here
        };
        const waitingFor = mapMap(this.plugins, (_, plugin) => plugin.start(loptions));
        await Promise.all(waitingFor);
        this.transitionTo(PluginManagerState.PreObserve);
    }

    async observe() {
        this.transitionTo(PluginManagerState.Observing);
        const dom = this.dom;
        const prevDom = this.prevDom;
        if (dom === undefined || prevDom === undefined) {
            throw new Error("Must call start before observe");
        }
        const observationsP = mapMap(
            this.plugins,
            async (name, plugin) => ({ name, obs: await plugin.observe(prevDom, dom) }));
        const observations = await Promise.all(observationsP);
        for (const { name, obs } of observations) {
            this.observations[name] = JSON.stringify(obs);
        }

        this.transitionTo(PluginManagerState.PreAnalyze);
    }

    analyze() {
        this.transitionTo(PluginManagerState.Analyzing);
        const dom = this.dom;
        const prevDom = this.prevDom;
        if (dom === undefined || prevDom === undefined) {
            throw new Error("Must call start before analyze");
        }
        const actionsTmp = mapMap(
            this.plugins,
            (name, plugin) => {
                const obs = JSON.parse(this.observations[name]);
                return plugin.analyze(prevDom, dom, obs);
            });

        this.actions = ld.flatten(actionsTmp);
        this.transitionTo(PluginManagerState.PreAct);
        return this.actions;
    }

    async act(dryRun: boolean) {
        let errored = false;
        this.transitionTo(PluginManagerState.Acting);
        const actions = this.actions;
        const log = this.logger;
        if (actions == undefined) throw new Error("Must call analyze before act");
        if (log == undefined) throw new Error("Must call start before act");

        actions.map((action) => log.info(`Doing ${action.description}...`));
        if (dryRun) {
            this.transitionTo(PluginManagerState.PreAct);
            return actions.map((action) => ({ action }));
        } else {
            const wrappedActions: Promise<ActionResult>[] = actions.map(async (action) => {
                try {
                    await action.act();
                    return { action };
                } catch (err) {
                    errored = true;
                    logError(action, err, (m) => log.error(m));
                    return { action, err };
                }
            });

            const results = await Promise.all(wrappedActions);
            if (errored) throw new Error(`Errors encountered during plugin action phase`);
            this.transitionTo(PluginManagerState.PreFinish);
            return results;
        }
    }

    async finish() {
        this.transitionTo(PluginManagerState.Finishing);
        const waitingFor = mapMap(this.plugins, (_, plugin) => plugin.finish());
        await Promise.all(waitingFor);
        this.dom = undefined;
        this.prevDom = undefined;
        this.actions = undefined;
        this.logger = undefined;
        this.observations = {};
        this.transitionTo(PluginManagerState.Initial);
    }
}

export interface PluginRegistration {
    name: string;
    module: NodeModule;
    create(): Plugin;
}

interface PluginModule extends PluginRegistration {
    name: string;
    packageName: string;
    version: string;
}

function pluginKey(pMod: PluginModule): PluginKey {
    return `${pMod.name} [${pMod.packageName}@${pMod.version}]`;
}

type PluginModules = Map<PluginKey, PluginModule>;

export function registerPlugin(plugin: PluginRegistration) {
    const modules = getPluginModules(true);
    const pInfo = findPackageInfo(path.dirname(plugin.module.filename));
    const mod = {
        ...plugin,
        packageName: pInfo.name,
        version: pInfo.version,
    };
    const key = pluginKey(mod);

    const existing = modules.get(key);
    if (existing !== undefined) {
        // Ignore if they're registering the exact same info
        if (existing.create === plugin.create) return;
        throw new Error(
            `Attempt to register two plugins with the same name from the ` +
            `same package: ${key}`);
    }
    modules.set(key, mod);
}

export function createPluginConfig(): PluginConfig {
    const plugins: RegisteredPlugins = new Map<PluginKey, Plugin>();
    const modules = getPluginModules();
    if (modules == null) throw new Error(`No plugins registered`);

    for (const [ key, mod ] of modules) {
        plugins.set(key, mod.create());
    }
    return { plugins };
}

function getPluginModules(create = false): PluginModules {
    const aContext = getAdaptContext();
    if (!aContext.pluginModules && create === true) {
        aContext.pluginModules = new Map<PluginKey, PluginModule>();
    }
    return aContext.pluginModules;
}
