import { CustomError } from "ts-custom-error";
import { inspect } from "util";
import { Message, messagesToString } from "./utils";

export class BuildNotImplemented extends CustomError {
    public constructor(message?: string) {
        super(message);
    }
}

export class ProjectBuildError extends CustomError {
    constructor(msgs: Message[], domXmlString: string) {
        super(`Error building Adapt project\n${messagesToString(msgs)}`);
    }
}

export class ProjectCompileError extends CustomError {
    constructor(msg: string) {
        super(`Error compiling Adapt project\n${msg}`);
    }
}

export class ProjectRunError extends CustomError {
    projectError: Error;
    projectStack: string;
    fullStack: string;

    constructor(projectError: Error, projectStack: string, fullStack: string) {
        let msg = `Error executing Adapt project: `;
        msg += projectError.message || projectError.name;
        super(msg);
        this.projectError = projectError;
        this.projectStack = projectStack;
        this.fullStack = fullStack;
    }
}

export class ThrewNonError extends CustomError {
    constructor(public thrown: any) {
        super(`An exception was thrown with a non-Error object: '${inspect(thrown)}'`);
    }
}

export function isError(val: any): val is Error {
    return (
        (val != null) &&
        (typeof val.message === "string") &&
        (typeof val.name === "string") &&
        (val.stack === undefined || typeof val.stack === "string")
    );
}
