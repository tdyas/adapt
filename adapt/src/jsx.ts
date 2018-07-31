import * as util from "util";

import * as ld from "lodash";

import { StyleRule } from "./css";
import { BuildNotImplemented } from "./error";
import { KeyTracker, UpdateStateInfo } from "./keys";
import { applyStateUpdate, computeStateUpdate, StateNamespace, StateStore, StateUpdater } from "./state";
import * as tySup from "./type_support";

//This is broken, why does JSX.ElementClass correspond to both the type
//a Component construtor has to return and what createElement has to return?
//I don't think React actually adheres to this constraint.
export interface AdaptElement<P extends object = AnyProps> {
    readonly props: P;
    readonly componentType: ComponentType<P>;
}

export interface AdaptMountedElement<P extends object = AnyProps> extends AdaptElement<P> {
    readonly id: string;
}

export interface AdaptPrimitiveElement<P extends object = AnyProps> extends AdaptElement<P> {
    readonly componentType: PrimitiveClassComponentTyp<P>;
    updateState(state: any, keys: KeyTracker, info: UpdateStateInfo): void;
}

export type AdaptElementOrNull = AdaptElement<AnyProps> | null;

export function isElement<P extends object = AnyProps>(val: any): val is AdaptElement<P> {
    return val instanceof AdaptElementImpl;
}

export function isMountedElement<P extends object = AnyProps>(val: any): val is AdaptMountedElement<P> {
    return isElementImpl(val) && val.mounted;
}

export function isElementImpl<P extends object = AnyProps>(val: any): val is AdaptElementImpl<P> {
    return isElement(val);
}

export abstract class Component<Props extends object = {}, State extends object = {}> {

    readonly state: State;

    // cleanup gets called after build of this component's
    // subtree has completed.
    cleanup?: (this: this) => void;
    private stateUpdates: Partial<State>[] = [];

    constructor(readonly props: Props) { }

    setState(stateUpdate: Partial<State> | StateUpdater<Props, State>): void {
        const upd = computeStateUpdate(this.state, this.props, stateUpdate);
        this.stateUpdates.push(upd);
    }

    build(): AdaptElementOrNull {
        throw new BuildNotImplemented();
    }
}

export type PropsType<Comp extends tySup.Constructor<Component<any, any>>> =
    Comp extends tySup.Constructor<Component<infer CProps, any>> ? CProps :
    never;

export abstract class PrimitiveComponent<Props extends object>
    extends Component<Props> {

    updateState(_state: any, _info: UpdateStateInfo) { return; }
}

export function isPrimitive<P extends object>(component: Component<P>):
    component is PrimitiveComponent<P> {
    return component instanceof PrimitiveComponent;
}

export type SFC = (props: AnyProps) => AdaptElementOrNull;

export function isComponent<P extends object, S extends object>(func: SFC | Component<P, S>):
    func is Component<P, S> {
    return func instanceof Component;
}

export function isPrimitiveElement(elem: AdaptElement): elem is AdaptPrimitiveElement<AnyProps> {
    return isPrimitive(elem.componentType.prototype);
}

export interface ComponentStatic<P> {
    defaultProps?: Partial<P>;
}
export interface FunctionComponentTyp<P> extends ComponentStatic<P> {
    (props: P): AdaptElementOrNull;
}
export interface ClassComponentTyp<P extends object, S extends object> extends ComponentStatic<P> {
    new(props: P): Component<P, S>;
}
export interface PrimitiveClassComponentTyp<P extends object> extends ComponentStatic<P> {
    new(props: P): PrimitiveComponent<P>;
}

export type ComponentType<P extends object> =
    FunctionComponentTyp<P> |
    ClassComponentTyp<P, AnyState> |
    PrimitiveClassComponentTyp<P>;

export interface AnyProps {
    [key: string]: any;
}

export interface BuiltinProps {
    key?: string;
}

export interface AnyState {
    [key: string]: any;
}

export interface WithChildren {
    children?: any | any[];
}

export type GenericComponent = Component<AnyProps, AnyState>;

/**
 * Keep track of which rules have matched for a set of props so that in the
 * typical case, the same rule won't match the same component instance more
 * than once.
 *
 * @interface MatchProps
 */
export interface MatchProps {
    matched?: Set<StyleRule>;
    stop?: boolean;
}
export const $cssMatch = Symbol.for("$cssMatch");
export interface WithMatchProps {
    [$cssMatch]?: MatchProps;
}

export class AdaptElementImpl<Props extends object> implements AdaptElement<Props> {
    readonly props: Props & WithChildren & Required<WithMatchProps>;

    stateNamespace: StateNamespace = [];
    mounted = false;
    component: GenericComponent | null;

    constructor(
        readonly componentType: ComponentType<Props>,
        props: Props,
        children: any[]) {

        this.props = {
            [$cssMatch]: {},
            // https://github.com/Microsoft/TypeScript/pull/13288
            ...props as any
        };
        // Children passed as explicit parameter replace any on props
        if (children.length > 0) this.props.children = children;

        // Validate and flatten children.
        this.props.children = simplifyChildren(this.props.children);
        if (this.props.children === undefined) {
            delete this.props.children;
        }

        Object.freeze(this.props);
    }

    mount(parentNamespace: StateNamespace) {
        if (this.mounted) {
            throw new Error("Cannot remount elements!");
        }
        if ("key" in this.props) {
            const propsWithKey = this.props as Props & { key: string };
            this.stateNamespace = [...parentNamespace, propsWithKey.key];
        } else {
            throw new Error(`Internal Error: props has no key at mount: ${util.inspect(this)}`);
        }
        this.mounted = true;
    }

    postBuild(stateStore: StateStore) {
        if (this.component != null) {
            const updates = ((this.component as any) as { stateUpdates: AnyState[] }).stateUpdates;
            if (updates.length > 0) {
                applyStateUpdate(this.stateNamespace, this.component, stateStore, Object.assign.apply({}, updates));
            }
        }
    }

    get id() { return JSON.stringify(this.stateNamespace); }
}

export class AdaptPrimitiveElementImpl<Props extends object> extends AdaptElementImpl<Props> {
    componentInstance?: PrimitiveComponent<AnyProps>;

    constructor(
        readonly componentType: PrimitiveClassComponentTyp<Props>,
        props: Props,
        children: any[]
    ) {
        super(componentType, props, children);
    }

    updateState(state: AnyState, keys: KeyTracker, info: UpdateStateInfo) {
        if (this.componentInstance == null) {
            this.componentInstance = new this.componentType(this.props);
        }

        keys.addKey(this.componentInstance);
        this.componentInstance.updateState(state, info);
        if (this.props.children == null ||
            !Array.isArray(this.props.children)) {
            return;
        }

        keys.pathPush();
        try {
            for (const child of this.props.children) {
                if (child == null) continue;
                if (isPrimitiveElement(child)) {
                    child.updateState(state, keys, info);
                }
            }
        } finally {
            keys.pathPop();
        }
    }
}

export function createElement<Props extends object>(
    ctor: string |
        FunctionComponentTyp<Props> |
        ClassComponentTyp<Props, AnyState>,
    //props should never be null, but tsc will pass null when Props = {} in .js
    //See below for null workaround, exclude null here for explicit callers
    props: tySup.ExcludeInterface<Props, tySup.Children<any>> & BuiltinProps,
    ...children: tySup.ChildType<Props>[]): AdaptElement {

    if (typeof ctor === "string") {
        throw new Error("createElement cannot called with string element type");
    }

    type PropsNoChildren =
        tySup.ExcludeInterface<Props, tySup.Children<any>>;

    //props===null PropsNoChildren == {}
    let fixedProps = ((props === null) ? {} : props) as PropsNoChildren;
    if (ctor.defaultProps) {
        // The 'as any' below is due to open TS bugs/PR:
        // https://github.com/Microsoft/TypeScript/pull/13288
        fixedProps = {
            ...ctor.defaultProps as any,
            ...props as any
        };
    }
    if (isPrimitive(ctor.prototype)) {
        return new AdaptPrimitiveElementImpl(
            ctor as PrimitiveClassComponentTyp<Props>,
            fixedProps,
            children);
    } else {
        return new AdaptElementImpl(ctor, fixedProps, children);
    }
}

export function cloneElement(
    element: AdaptElement,
    props: AnyProps,
    ...children: any[]): AdaptElement {

    const newProps = {
        ...element.props,
        ...props
    };

    if (isPrimitiveElement(element)) {
        return new AdaptPrimitiveElementImpl(element.componentType, newProps, children);
    } else {
        return new AdaptElementImpl(element.componentType, newProps, children);
    }
}

export function childrenToArray(propsChildren: any | any[] | undefined): any[] {
    const ret = simplifyChildren(propsChildren);
    if (ret == null) return [];
    if (!Array.isArray(ret)) return [ret];
    return ret;
}

export function simplifyChildren(children: any | any[] | undefined): any | any[] | undefined {
    if (ld.isArray(children)) {
        const flatChildren = ld.flatten(children);
        children = flatChildren.filter((e) => e != null);

        if (children.length === 0) {
            return undefined;
        } else if (children.length === 1) {
            return children[0];
        }
    }

    return children;
}