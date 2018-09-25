// The ObserverDeploymentManager manages the functionality needed
// to process observation queries when evaluating the state of a deployment.
//
// The ObserverDataManager (not written yet) manages fetching of observed
// data via poll or watch.

import { removeUndef } from "@usys/utils";
import {
    DocumentNode as Query,
    execute as gqlExecute,
    ExecutionResult,
    GraphQLSchema,
    print as gqlPrint
} from "graphql";
import * as ld from "lodash";
import { ObserverResponse } from ".";
import { ObserverNameHolder } from "./registry";

interface Variables {
    [n: string]: any;
}

export interface ExecutedQuery {
    query: Query;
    variables?: Variables;
}

export interface ObserverManagerDeployment {
    registerSchema(name: ObserverNameHolder, schema: GraphQLSchema, observations: ObserverResponse): void;
    executedQueries(): { [name: string]: ExecutedQuery[] };
    executedQueriesThatNeededData(): { [name: string]: ExecutedQuery[] };
    executeQuery<R = any>(observer: ObserverNameHolder, q: Query, vars?: Variables): Promise<ExecutionResult<R>>;
}

export function createObserverManagerDeployment() {
    return new ObserverManagerDeploymentImpl();
}

type ExecutedQueryStorage = Map<string, { doc: Query, vars: Set<Variables | undefined> }>;

interface Observable {
    schema: GraphQLSchema;
    observations: ObserverResponse;
    executedQueries: ExecutedQueryStorage;
}

function addExecutedQuery(o: ExecutedQueryStorage, query: ExecutedQuery) {
    const key = gqlPrint(query.query); //Would be better to have canonicalized key here
    const entry = o.get(key);
    if (entry === undefined) {
        const vars = new Set<Variables | undefined>([query.variables]);
        o.set(key, { doc: query.query, vars: ld.cloneDeep(vars) });
        return;
    }

    //FIXME(manishv) If this is slow, need a better data structure for unique vars
    for (const val of entry.vars) {
        if (ld.isEqual(val, query.variables)) return;
    }

    //If we made it here, we need to add current query variabless to the set
    entry.vars.add(query.variables);
}

function flattenExecutedQueryStorage(queries: ExecutedQueryStorage) {
    const ret = [];
    for (const val of queries.values()) {
        for (const vars of val.vars.values()) {
            ret.push({ query: val.doc, variables: vars });
        }
    }
    return ret;
}

class ObserverManagerDeploymentImpl implements ObserverManagerDeployment {
    observable: { [name: string]: Observable } = {};
    needsData: { [name: string]: ExecutedQueryStorage } = {};

    registerSchema = (observer: ObserverNameHolder, schema: GraphQLSchema, observations: ObserverResponse): void => {
        const name = observer.observerName;
        if (name in this.observable) throw new Error("Cannot register schema with name: " + name);
        this.observable[name] = {
            schema,
            observations,
            executedQueries: new Map<string, { doc: Query, vars: Set<Variables | undefined> }>()
        };
    }

    executedQueries = () => {
        const ret: { [name: string]: ExecutedQuery[] } = {};
        for (const schemaName in this.observable) {
            if (!Object.hasOwnProperty.call(this.observable, schemaName)) continue;
            ret[schemaName] = flattenExecutedQueryStorage(this.observable[schemaName].executedQueries);
        }
        return ret;
    }

    executedQueriesThatNeededData = () => {
        const ret: { [name: string]: ExecutedQuery[] } = {};
        for (const schemaName in this.needsData) {
            if (!Object.hasOwnProperty.call(this.needsData, schemaName)) continue;
            ret[schemaName] = flattenExecutedQueryStorage(this.needsData[schemaName]);
        }
        return ret;
    }

    executeQuery = async <R = any>(observer: ObserverNameHolder, q: Query, vars?: Variables):
        Promise<ExecutionResult<R>> => {
        const schemaName = observer.observerName;
        if (!(schemaName in this.observable)) throw new Error("Unknown observation schema queried: " + schemaName);
        const { schema, observations, executedQueries } = this.observable[schemaName];
        const query = { query: q, variables: vars };
        addExecutedQuery(executedQueries, query);
        const ret = await Promise.resolve(gqlExecute<R>(schema, q, observations.data, observations.context, vars));
        if (ret.errors) {
            const needDataErr = ret.errors.find((e) => e.message.startsWith("Adapt Observer Needs Data:"));
            if (needDataErr !== undefined) {
                if (this.needsData[schemaName] === undefined) {
                    this.needsData[schemaName] = new Map<string, { doc: Query, vars: Set<Variables | undefined> }>();
                }
                addExecutedQuery(this.needsData[schemaName], query);
            }
        }
        return ret;
    }
}

type SimplifyReturns = ReturnType<typeof simplifyNeedsData>;
export function simplifyNeedsData(
    nd: { [name: string]: ExecutedQuery[] }): { [name: string]: { query: string, variables?: Variables }[] } {

    const ret: SimplifyReturns = {};

    for (const obsName in nd) {
        if (!Object.hasOwnProperty.call(nd, obsName)) continue;
        ret[obsName] = nd[obsName].map((q) => removeUndef(
            ({ query: gqlPrint(q.query), variables: JSON.parse(JSON.stringify(q.variables)) }))
        ) as { query: string, variables?: Variables }[];
    }

    return ret;
}
