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

import Adapt, {
    handle,
    Sequence,
    SFCBuildProps,
    SFCDeclProps,
    useMethodFrom,
} from "@adpt/core";
import { Dispatcher, notNull } from "@adpt/utils";
import { Container } from "../Container";
import { LocalDockerImage } from "../docker";
import {
    Destination,
    fileHandles,
    HttpServer as AbsHttpServer,
    HttpServerProps,
    Location,
    Match,
    useFilesInfo,
} from "../http";
import { NetworkService } from "../NetworkService";
import { Service } from "../Service";

const nginxImg = "nginx:latest";

/*
 * Match
 */
const matchWriters = new Dispatcher<Match, string>("Match");
const matchConfig = (m: Match) => matchWriters.dispatch(m);
matchWriters.add("path", (m) => m.path);
matchWriters.add("regex", (m) => `~ ${m.regex}`);

/*
 * Dest
 */
const destWriters = new Dispatcher<Destination, string>("Destination");
const destConfig = (d: Destination) => destWriters.dispatch(d);
destWriters.add("files", (d) => d.filesRoot ? `root ${d.filesRoot};` : "");

/*
 * Location
 */
const locationConfig = (loc: Location) => `
        location ${matchConfig(loc.match)} {
            ${destConfig(loc.dest)}
        }
`;

function useMakeNginxConf(props: HttpServerProps) {
    const servers = props.servers || [];
    if (servers.length === 0) {
        throw new Error(`Nginx configuration must contain at least one virtual server`);
    }
    if (servers.length > 1) {
        throw new Error(`Multiple servers not implemented yet`);
    }

    const serverConf = servers.map((s) => {
        const locations = s.locations.map(locationConfig);
        const root = s.filesRoot ? `root ${s.filesRoot};` : "";
        return `
    server {
        ${root}
        listen ${props.port};
${locations.join("\n")}
    }
`;
    });

    return `
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

${serverConf.join("\n")}
}
`;
}

const defaultProps = {
    ...AbsHttpServer.defaultProps,
    servers: [{
        filesRoot: "/www/static",
        locations: [{
            match: { type: "path", path: "/" },
            dest: { type: "files" },
        }],
    }]
};

/**
 * {@link http.HttpServer} implementation based on {@link https://nginx.org | nginx}
 *
 * @public
 */
export function HttpServer(propsIn: SFCDeclProps<HttpServerProps, typeof defaultProps>) {
    const props = propsIn as SFCBuildProps<HttpServerProps, typeof defaultProps>;
    const netSvc = handle();
    const nginx = handle();
    const img = handle();
    const deps = fileHandles(props.add);

    const nginxConf = useMakeNginxConf(props);

    const fileInfo = useFilesInfo(props.add) || [];
    const commands = fileInfo.map((f) => f.dockerCommands).join("\n");
    const stages = fileInfo.map((f) => f.stage).filter(notNull);

    //FIXME(manishv) nginx config check will only pass if all hostnames can be resolved locally, how to fix?
    //if (false) useAsync(async () => checkNginxConf(nginxConf), undefined);

    const dockerfile = `
        FROM ${nginxImg}
        RUN apt-get update && \
            apt-get install --no-install-recommends --no-install-suggests -y inotify-tools && \
            apt-get clean
        WORKDIR /nginx
        COPY --from=files / .
        ${commands}
        CMD [ "/bin/sh", "/nginx/start_nginx.sh" ]
        `;

    useMethodFrom(netSvc, "hostname");
    useMethodFrom(netSvc, "port");

    const ret = <Sequence key={props.key} >
        {...deps}
        <LocalDockerImage
            key={props.key + "-img"}
            handle={img}
            dockerfile={dockerfile}
            files={[{
                path: "start_nginx.sh",
                contents:
                    `#!/bin/sh
                    exec nginx -g "daemon off;" -c /nginx/nginx.conf
                    `
            },
            {
                path: "nginx.conf",
                contents: nginxConf
            }]}
            contextDir={props.localAddRoot}
            options={{
                imageName: "nginx-static",
                uniqueTag: true
            }}
            stages={stages}
        />
        <Service key={props.key} >
            <NetworkService
                key={props.key + "-netsvc"}
                handle={netSvc}
                endpoint={nginx}
                port={props.port}
                targetPort={props.port}
                scope={props.scope}
            />
            <Container
                key={props.key}
                handle={nginx}
                name="nginx-static"
                image={img}
                ports={[props.port]}
                imagePullPolicy="Never"
            />
        </Service >
    </Sequence>;
    return ret;
}

// FIXME(mark): The "as any" can be removed when we upgrade to TS > 3.2
(HttpServer as any).defaultProps = defaultProps;

export default HttpServer;
