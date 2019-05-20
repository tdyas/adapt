# Adapt Getting Started Guide

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Introduction](#introduction)
- [Requirements](#requirements)
- [Installing Adapt](#installing-adapt)
- [Creating a project](#creating-a-project)
- [Setting up Kubernetes](#setting-up-kubernetes)
- [Deploy!](#deploy)
- [Testing the Default Application](#testing-the-default-application)
- [Writing the Real Application Code](#writing-the-real-application-code)
- [Update the Deployment!](#update-the-deployment)
- [Cleaning up](#cleaning-up)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Introduction

Adapt is a [React](http://reactjs.org)-like system to easily, reliably, and repeatably deploy applications and infrastructure.  If you are familiar with React, many of the concepts will look familiar.  If not, not to worry, this guide, and the [User Guide](../user) cover everything you'll need to know to get started using Adapt and make it work for your project.

## Requirements

To install and use Adapt, you must have [Docker](http://docker.com) and [node.js](http://nodejs.org) v10, along with npm, installed on your system. The [User Guide](../user) has some [help](../user/install/requirements.md) to set this up.

## Installing Adapt

First, we need to install the `adapt` CLI.  To do this type
```
npm install -g @adpt/cli
```

Alternatively, you can forgo installing `adapt` globally and use `npx` instead.
To use Adapt via `npx`, any time you see an `adapt` CLI command in this guide, substitute `npx @adpt/cli` instead of `adapt`.
For example, to run `adapt new blank` you would type 
```
npx @adpt/cli new blank
```

The rest of this guide will assume you have installed adapt globally using `npm install -g`.

## Creating a project

We'll be building a small movie database application with a node.js backend and a React front-end.
The following `adapt` command will create a new directory called `moviedb` in the current directory and create a new Adapt project using a starter template.
The second command changes into the `moviedb/deploy` directory.

```
adapt new http://<FIXME: insert repo url here> ./moviedb

cd moviedb/deploy
```

The template we have chosen describes an application with an [NGINX](http://nginx.org) static server to serve a React application created with `create-react-app`, and a node.js API server that is connected to a [Postgres](http://postgres.org) database.
An NGINX URL router splits traffic to the URL path `/api` to the node.js API server, and all other URL requests to the static server.  

You can see the Adapt description for this architecture in `moviedb/deploy/index.tsx`.  This file defines a single functional component called `App` that returns the overall application that is to be instantiated.
```tsx
function App() {
    const pg = handle();
    const api = handle();
    const stat = handle();

    const connectEnv = useMethod(pg, {}, "connectEnv");

    return <Group key="App">

        <NginxUrlRouter key="url-router"
            port={8080}
            routes={[
                { path: "/api/", endpoint: api, upstreamPath: "/api/" },
                { path: "/", endpoint: stat }
            ]} />

        <NodeService key="api-service" handle={api}
            srcDir=".." env={connectEnv} deps={pg} />

        <Postgres handle={pg} />

        <NginxStatic key="static-service" handle={stat}
            localAddRoot="../public" scope="cluster-internal"
            add={[{ type: "image", image: api, stage: "app",
                    files: [{ src: "/app/build", dest: "/www/static" }]}]} />

    </Group>;
}
```
If you are familiar with React, this file should look familiar. `App` is exactly analagous to an SFC, and the return value defines what an instance of `App` should be, just like in React.  If you aren't familiar with React, no worries, you can still follow the rest of this guide, and then dig in to the details with the [User Guide](../user).

## Setting up Kubernetes

Our new project is ready to deploy, but we need somewhere to deploy it.
In this case we're going to use Kuberenetes and so we'll use a local Kubernetes cluster.
(Note that Kubernetes isn't a requirement for Adapt, it's only a requirement for this example.)
To deploy the local cluster and get the credentials:
```
docker run --rm --privileged -d -p10001:2375 -p8443:8443 -p8080:8080 --name local-k3s unboundedsystems/k3s-dind

docker exec -i -t local-k3s getkubeconfig.sh -json > kubeconfig.json
```

## Deploy!
Now, let's create a new deployment in k3s, using the `k8s` style sheet.
```
DOCKER_HOST=localhost:10001 adapt run --name moviedb::k8s
```
When the deployment is complete, Adapt prints the DeployID. 

> Deployment created successfully. DeployID is: **moviedb::k8s**

We can always look at our list of known deployments by asking Adapt.
```
adapt list
```

## Testing the Default Application

Once the app is deployed into Kubernetes, it will be available at [http://localhost:8080](http://localhost:8080).

If you open this URL in your browser or use curl to fetch it, you should
see the default front-end text.

> Hello World!

You can also check the app status directly via adapt:
```
adapt status moviedb::k8s
```

## Writing the Real Application Code

As we've seen, the starter template we used with `adapt new` has created a default set of code for both our front-end and back-end application.
To build the real application, we'll need to populate each location, `moviedb/frontend` and `moviedb/backend` with the appropriate code.
The details of the code are beyond the scope of this tutorial, but they are straightforward node.js and React apps.
To get and install the code type:
```
curl http://gitlab.com/unboundedsystems/adapt/<FIXME>moviedb-code.tar.bz2 | tar -xjvf -C ..
```

You can inspect the files in `moviedb/frontend` to see the React code that will be deployed, and similary `moviedb/backend` for the node.js API server.
The problem is that the backend needs a test database to work correctly.
Fortunately, this is fairly easy to do.
We just need to modify the `moviedb/deploy/styles.tsx` file to instantiate a test database with the correct mock data and database name.
To do this, modify the `<TestPostgres ... />` component to point to the correct test data like so:
```tsx
{Postgres} {Adapt.rule(() =>
    <TestPostgres mockDbName="moviedb" mockDataPath="../backend/mock-moviedb.sql" />)}
```

## Update the Deployment!
Now, we can update the deployment to push our new code and test database.
```
adapt update moviedb::k8s
```

Test the new application by connecting your browser to [http://localhost:8080](http://localhost:8080).
You should be able to type into the search box and get a list of matching movies.
Try typing `batman` if your searches turn up empty.

## Cleaning up

When you're done, destroy the app deployment.
```
adapt destroy moviedb::k8s
```

You may also want to stop K3S and remove the K3S container image:
```
docker stop local-k3s
docker rmi unboundedsystems/k3s-dind
```
