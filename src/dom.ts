import * as ld from "lodash";

import * as css from "./css";

import {
    childrenToArray,
    ClassComponentTyp,
    cloneElement,
    Component,
    FunctionComponentTyp,
    isAbstract,
    isPrimitive,
    UnbsElement,
    UnbsElementImpl,
    UnbsNode,
    WithChildren,
} from "./jsx";

import {
    BuildListener,
    BuildOp,
} from "./dom_build_data_recorder";
import { MustReplaceError } from "./error";

export enum MessageType {
    warning = "warning",
    error = "error",
}
export interface Message {
    type: MessageType;
    content: string;
}

type CleanupFunc = () => void;
class ComputeContents {
    wasPrimitive = false;
    contents: UnbsNode = null;
    messages: Message[] = [];
    cleanups: CleanupFunc[] = [];

    combine(other: ComputeContents) {
        this.messages.push(...other.messages);
        this.cleanups.push(...other.cleanups);
        other.messages = [];
        other.cleanups = [];
    }
    cleanup() {
        let clean: CleanupFunc | undefined;
        do {
            clean = this.cleanups.pop();
            if (clean) clean();
        } while (clean);
    }
}

function computeContentsNoOverride<P extends object>(
    element: UnbsElement<P & WithChildren>): ComputeContents {
    let component: Component<P> | null = null;
    const ret = new ComputeContents();
    let doClone = false;
    let isPrim = false;

    try {
        ret.contents =
            (element.componentType as FunctionComponentTyp<P>)(element.props);
    } catch (e) {
        if (e instanceof TypeError &&
            /Class constructor .* cannot be invoked/.test(e.message)) {
            // element.componentType is a class, not a function.
            component =
                new (element.componentType as ClassComponentTyp<P>)(element.props);
        } else if (e instanceof MustReplaceError) {
            doClone = true;
        } else {
            throw e;
        }
    }

    if (component != null) {
        const isAbs = isAbstract(component);
        isPrim = isPrimitive(component);
        if (isAbs) {
            ret.messages.push({
                type: MessageType.warning,
                content: `Component ${element.componentType.name} is ` +
                    `abstract and has no build function`
            });
        }
        if (isPrim || isAbs) {
            doClone = true;
        } else {
            try {
                ret.contents = component.build();
            } catch (e) {
                if (e instanceof MustReplaceError) {
                    ret.messages.push({
                        type: MessageType.warning,
                        content: `Component ${element.componentType.name} ` +
                            `cannot be built with current props ` +
                            `(build threw MustReplaceError)`
                    });
                    doClone = true;
                } else {
                    throw e;
                }
            }
            if (component._cleanup) {
                ret.cleanups.push(() =>
                    component && component._cleanup && component._cleanup());
            }
        }
    }

    if (doClone) {
        ret.wasPrimitive = isPrim;
        ret.contents =
            cloneElement(element, {}, ...childrenToArray(element.props.children));
    }
    return ret;
}

function findOverride(styles: css.StyleList, path: UnbsElement[]) {
    const element = path[path.length - 1];
    if (element.props.cssMatched === true) {
        return null;
    }
    for (const style of styles.reverse()) {
        if (style.match(path)) {
            return { style, override: style.sfc };
        }
    }
    return null;
}

function computeContents(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): ComputeContents {

    const out = new ComputeContents();
    const overrideFound = findOverride(styles, path);
    const element = path[path.length - 1];
    const noOverride = () => {
        const ret = computeContentsNoOverride(element);
        out.combine(ret);
        return ret.contents;
    };

    let wasPrimitive = false;
    let newElem: UnbsNode = null;
    let style: css.StyleRule | undefined;
    if (overrideFound != null) {
        const override = overrideFound.override;
        style = overrideFound.style;
        newElem = override(
            { ...element.props, cssMatched: true },
            { origBuild: noOverride, origElement: element });
    } else {
        const ret = computeContentsNoOverride(element);
        wasPrimitive = ret.wasPrimitive;
        newElem = ret.contents;
        out.combine(ret);
    }

    if (!wasPrimitive) options.recorder({ type: "step", oldElem: element, newElem, style });
    out.contents = newElem;
    return out;
}

function mountAndBuildComponent(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): ComputeContents {

    const out = computeContents(path, styles, options);

    if (out.contents != null) {
        if (Array.isArray(out.contents)) {
            const comp = path[path.length - 1].componentType;
            throw new Error(`Component build for ${comp.name} returned an ` +
                `array. Components must return a single root element when ` +
                `built.`);
        }
        if (isPrimitive(out.contents.componentType.prototype)) {
            return out;
        }
        if (path.length > 0 && ld.isEqual(out.contents, path[path.length - 1])) {
            // Contents didn't change, typically due to an abstract component
            return out;
        }
        const newPath = path.slice(0, -1);
        newPath.push(out.contents);
        const ret = mountAndBuildComponent(newPath, styles, options);
        out.combine(ret);
        out.contents = ret.contents;
    }
    return out;
}

function notNull(x: any): boolean {
    return x != null;
}

export interface BuildOptions {
    depth?: number;
    shallow?: boolean;
    recorder?: BuildListener;
}

const defaultBuildOptions = {
    depth: -1,
    shallow: false,
    // Next line shouldn't be needed.  VSCode tslint is ok, CLI is not.
    // tslint:disable-next-line:object-literal-sort-keys
    recorder: (_op: BuildOp) => { return; },
};

type BuildOptionsReq = Required<BuildOptions>;

export interface BuildOutput {
    contents: UnbsNode;
    messages: Message[];
}
export function build(root: UnbsElement,
    styles: UnbsElement | null,
    options?: BuildOptions): BuildOutput {

    const styleList = css.buildStyles(styles);

    return pathBuild([root], styleList, options);
}

function atDepth(options: BuildOptionsReq, depth: number) {
    if (options.shallow) return true;
    if (options.depth === -1) return false;
    return depth >= options.depth;
}

function pathBuild(
    path: UnbsElement[],
    styles: css.StyleList,
    optionsIn?: BuildOptions): BuildOutput {

    const options = { ...defaultBuildOptions, ...optionsIn };
    const root = path[path.length - 1];
    options.recorder({ type: "start", root });
    let ret = null;
    try {
        ret = realBuild(path, styles, options);
    } catch (error) {
        options.recorder({ type: "error", error });
        throw error;
    }
    options.recorder({ type: "done", root: ret.contents });
    return {
        contents: ret && ret.contents,
        messages: (ret && ret.messages) || [],
    };
}

function realBuild(
    path: UnbsElement[],
    styles: css.StyleList,
    options: BuildOptionsReq): ComputeContents {

    let out = new ComputeContents();

    if (options.depth === 0) {
        out.contents = path[0];
        return out;
    }

    const oldElem = path[path.length - 1];
    out = mountAndBuildComponent(path, styles, options);
    const newRoot = out.contents;
    options.recorder({ type: "elementBuilt", oldElem, newElem: newRoot });

    if (newRoot == null || atDepth(options, path.length)) {
        return out;
    }

    const children = newRoot.props.children;
    let newChildren: any = null;
    if (children == null) {
        return out;
    }

    //FIXME(manishv) Make this use an explicit stack
    //instead of recursion to avoid blowing the call stack
    //For deep DOMs
    let childList: any[] = [];
    if (children instanceof UnbsElementImpl) {
        childList = [newChildren];
    } else if (ld.isArray(children)) {
        childList = children;
    }

    newChildren = childList.map((child) => {
        if (child instanceof UnbsElementImpl) {
            options.recorder({ type: "descend", descendFrom: newRoot, descendTo: child });
            const ret = realBuild([...path, child], styles, options);
            options.recorder({ type: "ascend", ascendTo: newRoot, ascendFrom: child });
            ret.cleanup(); // Do lower level cleanups before combining msgs
            out.combine(ret);
            return ret.contents;
        } else {
            return child;
        }
    });

    newChildren = newChildren.filter(notNull);

    out.contents = cloneElement(newRoot, {}, ...newChildren);
    return out;
}
