import * as ld from "lodash";

import * as css from "./css";

import {
    cloneElement,
    Component,
    isPrimitive,
    UnbsElement,
    UnbsElementImpl,
    UnbsNode,
} from "./jsx";

function computeContentsNoOverride(element: UnbsElement): UnbsNode {
    let component: Component<any> | null = null;
    let contents: UnbsNode = null;

    try {
        contents = element.componentType(element.props);
    } catch (e) {
        component = new element.componentType(element.props);
    }

    if (component != null) {
        if (isPrimitive(component)) {
            if (element.props.children != null) {
                return cloneElement(element, {}, ...element.props.children);
            } else {
                return cloneElement(element, {});
            }
        } else {
            contents = component.build();
        }
    }

    return contents;
}

function findOverride(styles: css.StyleList, path: UnbsElement[]) {
    const element = path[path.length - 1];
    if (element.props.cssMatched === true) {
        return null;
    }
    for (const style of styles.reverse()) {
        if (style.match(path)) {
            return style.sfc;
        }
    }
    return null;
}

function computeContents(path: UnbsElement[], styles: css.StyleList): UnbsNode {
    const override = findOverride(styles, path);
    const element = path[path.length - 1];
    const noOverride = (shallow: boolean = true) => {
        const newPath = path.slice(0, -1);
        newPath.push(cloneElement(element, { cssMatched: true }));
        return realBuild(newPath, styles, shallow);
    };
    if (override != null) {
        return override({ ...element.props, buildOrig: noOverride });
    }
    return computeContentsNoOverride(element);
}

function mountAndBuildComponent(path: UnbsElement[], styles: css.StyleList): UnbsNode {
    const contents = computeContents(path, styles);

    if (contents != null) {
        if (isPrimitive(contents.componentType.prototype)) {
            return contents;
        }
        const newPath = path.slice(0, -1);
        newPath.push(contents);
        return mountAndBuildComponent(newPath, styles);
    } else {
        return null;
    }
}

function notNull(x: any): boolean {
    return x != null;
}

export function build(root: UnbsElement,
    styles: UnbsElement | null,
    shallow: boolean = false): UnbsNode {

    const styleList = css.buildStyles(styles);

    return realBuild([root], styleList, shallow);
}

function realBuild(
    path: UnbsElement[],
    styles: css.StyleList,
    shallow: boolean): UnbsNode {

    const newRoot = mountAndBuildComponent(path, styles);

    if (shallow) {
        return newRoot;
    }

    if (newRoot == null) {
        return newRoot;
    }

    const children = newRoot.props.children;
    let newChildren: any = null;
    if (children == null) {
        return newRoot;
    }

    //FIXME(manishv) Make this use an explicit stack
    //instead of recursion to avoid blowing the call stack
    //For deep DOMs
    if (children instanceof UnbsElementImpl) {
        newChildren = realBuild([...path, children], styles, false);
    } else if (ld.isArray(children)) {
        newChildren = children.map((child) => {
            if (child instanceof UnbsElementImpl) {
                return realBuild([...path, child], styles, false);
            } else {
                return child;
            }
        });
        newChildren = newChildren.filter(notNull);
    }

    return cloneElement(newRoot, {}, ...newChildren);
}