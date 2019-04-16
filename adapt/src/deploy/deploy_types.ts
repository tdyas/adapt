import {
    Logger,
    MessageLogger,
    TaskObserver,
} from "@usys/utils";
import { isFunction, isObject, isString } from "lodash";
import { DomDiff } from "../dom_utils";
import { InternalError } from "../error";
import { Handle } from "../handle";
import {
    AdaptElementOrNull,
    AdaptMountedElement,
    FinalDomElement,
} from "../jsx";
import { Deployment } from "../server/deployment";
import { DeploymentSequence } from "../server/deployment_data";
import { Status } from "../status";

export enum DeployStatus {
    Initial = "Initial",
    Waiting = "Waiting",
    Deploying = "Deploying",
    Destroying = "Destroying",
    //Retrying = "Retrying",

    // Final states
    Deployed = "Deployed",
    Failed = "Failed",
    Destroyed = "Destroyed",
}

export function isDeployStatus(val: any): val is DeployStatus {
    switch (val) {
        case DeployStatus.Initial:
        case DeployStatus.Waiting:
        case DeployStatus.Deploying:
        case DeployStatus.Destroying:
        //case DeployStatus.Retrying:
        case DeployStatus.Deployed:
        case DeployStatus.Failed:
        case DeployStatus.Destroyed:
            return true;
        default:
            return false;
    }
}

export type FinalStatus =
    DeployStatus.Deployed |
    DeployStatus.Destroyed |
    DeployStatus.Failed;

export function isFinalStatus(ds: DeployStatusExt): ds is FinalStatus {
    switch (ds) {
        case DeployStatus.Deployed:
        case DeployStatus.Destroyed:
        case DeployStatus.Failed:
            return true;
        default:
            return false;
    }
}

export type GoalStatus =
    DeployStatus.Deployed |
    DeployStatus.Destroyed;

export function isGoalStatus(ds: DeployStatusExt): ds is GoalStatus {
    switch (ds) {
        case DeployStatus.Deployed:
        case DeployStatus.Destroyed:
            return true;
        default:
            return false;
    }
}

export function goalToInProgress(stat: GoalStatus) {
    const ret =
        stat === DeployStatus.Deployed ? DeployStatus.Deploying :
        stat === DeployStatus.Destroyed ? DeployStatus.Destroying :
        undefined;
    if (!ret) throw new InternalError(`Bad GoalStatus '${stat}'`);
    return ret;
}

export function isInProgress(stat: DeployStatusExt) {
    return stat === DeployStatusExt.Deploying || stat === DeployStatusExt.Destroying;
}

export function isProxying(stat: DeployStatusExt) {
    return stat === DeployStatusExt.ProxyDeploying ||
        stat === DeployStatusExt.ProxyDestroying;
}

export type PluginKey = string;
export type PluginInstances = Map<PluginKey, Plugin>;
export type PluginModules = Map<PluginKey, PluginModule>;

export interface PluginRegistration {
    name: string;
    module: NodeModule;
    create(): Plugin;
}

export interface PluginModule extends PluginRegistration {
    packageName: string;
    version: string;
}

export interface PluginConfig {
    plugins: PluginInstances;
    modules: PluginModules;
}

export enum ChangeType {
    none = "none",
    create = "create",
    delete = "delete",
    modify = "modify",
    replace = "replace",
}

/**
 * Describes the effect an Action has on an Element
 * type and detail here explain how the Action affects this specific
 * element, which may or may not be different than the action. For example,
 * an Action that performs a modify on a CloudFormation stack may cause
 * certain Elements to be created and deleted within that Action.
 */
export interface ActionChange {
    type: ChangeType;
    element: FinalDomElement;
    detail: string;
}

/**
 * Describes the overall effect that an Action is performing.
 * type and detail here explain what the Action is doing overall, not how it
 * affects any particular Element.
 */
export interface ActionInfo {
    type: ChangeType;
    detail: string;
    changes: ActionChange[];
}

export interface Action extends ActionInfo {
    act(): Promise<void>;
}

export interface PluginOptions {
    deployID: string;
    log: Logger;
    dataDir: string;
}

export interface PluginObservations {
    [pluginKey: string]: object;
}

export interface Plugin<Observations extends object = object> {
    seriesActions?: boolean;
    start(options: PluginOptions): Promise<void>;
    observe(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observations>; //Pull data needed for analyze
    analyze(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observations): Action[];
    finish(): Promise<void>;
}

export interface PluginManagerStartOptions {
    deployment: Deployment;
    logger: MessageLogger;
    dataDir: string;
}

export interface ActOptions {
    concurrency?: number;
    dryRun?: boolean;
    goalStatus?: GoalStatus;
    taskObserver: TaskObserver;
    timeoutMs?: number;
    sequence: DeploymentSequence;
}

export interface ActionResult {
    action: Action;
    err?: any;
}

export interface Relation {
    description: string;
    ready: (relatesTo: Relation[]) => true | Waiting | Waiting[];

    inverse?: (relatesTo: Relation[]) => Relation;
    relatesTo?: Relation[];
    toString?: (indent?: string) => string;
}

export interface RelationExt extends Relation {
    toDependencies?: () => Dependency[];
}

export function isRelation(v: any): v is Relation {
    return (
        isObject(v) &&
        isString(v.description) &&
        isFunction(v.ready) &&
        (v.inverse === undefined || isFunction(v.inverse)) &&
        (v.relatesTo === undefined || Array.isArray(v.relatesTo)) &&
        (v.toString === undefined || isFunction(v.toString))
    );
}

// A specific kind of Relation that operates on other Relations
export type RelationOp = (...args: Relation[]) => Relation;

export type DependsOn = Relation;
export type DependsOnMethod = (goalStatus: GoalStatus, helpers: DeployHelpers) => DependsOn | undefined;
export type DeployedWhenMethod = (goalStatus: GoalStatus, helpers: DeployHelpers) => WaitStatus | Promise<WaitStatus>;
export type Dependency = Handle | DependsOn;

export const isDependsOn = isRelation;

export interface WaitInfo {
    deployedWhen: (gs: GoalStatus) => ReturnType<DeployedWhenMethod>;
    description: string;

    actingFor?: ActionChange[];
    action?: () => void | Promise<void>;
    dependsOn?: RelationExt;
    logAction?: boolean;
}

export function isWaitInfo(v: any): v is WaitInfo {
    return (
        isObject(v) &&
        isFunction(v.deployedWhen) &&
        isString(v.description) &&
        (v.actingFor === undefined || Array.isArray(v.actingFor)) &&
        (v.action === undefined || isFunction(v.action)) &&
        (v.dependsOn === undefined || isDependsOn(v.dependsOn))
    );
}

export interface Waiting {
    done: false;
    status: string;
    related?: Waiting[];
}

export type WaitStatus = true | Waiting | Waiting[];

export type IsDeployedFunc = (dep: Dependency) => boolean;
export interface DeployHelpers {
    elementStatus: <S extends Status = Status>(handle: Handle) => Promise<S | Status | undefined>;
    isDeployed: IsDeployedFunc;
    dependsOn: (dep: Handle | Handle[]) => Relation;
}

export interface PluginManager {
    start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
        options: PluginManagerStartOptions): Promise<void>;
    observe(): Promise<PluginObservations>;
    analyze(): Action[];
    act(options: ActOptions): Promise<void>;
    finish(): Promise<void>;
}

export interface ExecutionPlanOptions {
    actions: Action[];
    deployment: Deployment;
    diff: DomDiff;
    goalStatus: GoalStatus;
    seriesActions?: Action[][];
}

export interface ExecutionPlan {
    check(): void;
}

export interface ExecuteOptions {
    concurrency?: number;
    dryRun?: boolean;
    logger: MessageLogger;
    plan: ExecutionPlan;
    pollDelayMs?: number;
    sequence: DeploymentSequence;
    taskObserver: TaskObserver;
    timeoutMs?: number;
}

export interface ExecutePassOptions extends Required<ExecuteOptions> {
    nodeStatus: StatusTracker;
    timeoutTime: number;
}

export interface ExecuteComplete {
    deploymentStatus: DeployStatus;
    nodeStatus: Record<DeployStatus, number>;
    primStatus: Record<DeployStatus, number>;
}

export interface EPNodeCommon {
    goalStatus: GoalStatus;
    hardDeps?: Set<EPNode>;
}
export interface EPNodeEl extends EPNodeCommon {
    element: AdaptMountedElement;
    waitInfo?: WaitInfo;
}
export interface EPNodeWI extends EPNodeCommon {
    element?: AdaptMountedElement;
    waitInfo: WaitInfo;
}

export function isEPNodeWI(n: EPNode): n is EPNodeWI {
    return isWaitInfo(n.waitInfo);
}

export type EPNode = EPNodeEl | EPNodeWI;
export type EPObject = EPNode | AdaptMountedElement | WaitInfo;
export type EPNodeId = string;

export interface EPEdge {
    hard?: boolean;
}

export interface StatusTracker {
    readonly deployment: Deployment;
    readonly dryRun: boolean;
    readonly goalStatus: GoalStatus;
    readonly nodeStatus: Record<DeployStatus, number>;
    readonly primStatus: Record<DeployStatus, number>;
    readonly statMap: Map<EPNode, DeployStatusExt>;
    readonly taskMap: Map<EPNode, TaskObserver>;
    readonly sequence: DeploymentSequence;
    get(n: EPNode): DeployStatusExt;
    set(n: EPNode, statExt: DeployStatusExt, err: Error | undefined,
        description?: string): Promise<boolean>;
    isFinal(n: EPNode): boolean;
    isActive(n: EPNode): boolean;
    output(n: EPNode, s: string): void;
    complete(): Promise<ExecuteComplete>;
    debug(getId: (n: EPNode) => string): string;
}

export enum InternalStatus {
    ProxyDeploying = "ProxyDeploying",
    ProxyDestroying = "ProxyDestroying",
}

export type DeployStatusExt = DeployStatus | InternalStatus;
// tslint:disable-next-line: variable-name
export const DeployStatusExt = { ...DeployStatus, ...InternalStatus };

export function toDeployStatus(stat: DeployStatusExt): DeployStatus {
    return (
        stat === DeployStatusExt.ProxyDeploying ? DeployStatus.Deploying :
        stat === DeployStatusExt.ProxyDestroying ? DeployStatus.Destroying :
        stat
    );
}
