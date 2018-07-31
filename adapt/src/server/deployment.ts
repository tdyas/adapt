import * as randomstring from "randomstring";
import { createPluginConfig, PluginConfig } from "../plugin_support";
import { AdaptServer } from "./server";

export interface Deployment {
    deployID: string;
    pluginConfig: PluginConfig;
}

const deploymentPath = "/deployments";
const maxTries = 100;

function dpath(deployID: string) {
    return `${deploymentPath}/${deployID}`;
}

function makeName(base: string) {
    const rand = randomstring.generate({
        length: 4,
        charset: "alphabetic",
        readable: true,
        capitalization: "lowercase",
    });
    return `${base}-${rand}`;
}

export async function createDeployment(server: AdaptServer, projectName: string,
    stackName: string): Promise<Deployment> {
    const baseName = `${projectName}::${stackName}`;
    let deployID = baseName;

    const deployData = {
        state: "new",
    };

    for (let i = 0; i < maxTries; i++) {
        try {
            await server.set(dpath(deployID), deployData, { mustCreate: true });
            break;
        } catch (err) {
            // continue
        }
        deployID = makeName(baseName);
    }

    const pluginConfig = createPluginConfig();
    return {
        deployID,
        pluginConfig,
    };
}

export async function loadDeployment(server: AdaptServer, deployID: string):
    Promise<Deployment> {
    try {
        // Validate that the deployment exists
        await server.get(dpath(deployID));
    } catch (err) {
        throw new Error(`Deployment '${deployID}' does not exist`);
    }

    const pluginConfig = createPluginConfig();
    return {
        deployID,
        pluginConfig,
    };
}