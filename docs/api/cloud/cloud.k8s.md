---
id: cloud.k8s
title: k8s namespace
hide_title: true
---
<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[@adpt/cloud](./cloud.md) &gt; [k8s](./cloud.k8s.md)

## k8s namespace

<b>Signature:</b>

```typescript
export * from "./Container";
export * from "./Resource";
export * from "./Pod";
export * from "./Service";
export * from "./ServiceDeployment";
export * from "./common";
export { K8sPlugin, createK8sPlugin, resourceElementToName, registerResourceKind } from "./k8s_plugin";
//# sourceMappingURL=index.d.ts.map
```

## Classes

|  Class | Description |
|  --- | --- |
|  [K8sContainer](./cloud.k8s.k8scontainer.md) |  |
|  [Pod](./cloud.k8s.pod.md) |  |
|  [Resource](./cloud.k8s.resource.md) |  |
|  [ServiceDeployment](./cloud.k8s.servicedeployment.md) |  |

## Functions

|  Function | Description |
|  --- | --- |
|  [computeNamespaceFromMetadata(metadata)](./cloud.k8s.computenamespacefrommetadata.md) |  |
|  [isContainerElement(x)](./cloud.k8s.iscontainerelement.md) |  |
|  [isResourceFinalElement(e)](./cloud.k8s.isresourcefinalelement.md) |  |
|  [k8sContainerProps(abstractProps)](./cloud.k8s.k8scontainerprops.md) |  |
|  [k8sServiceProps(abstractProps)](./cloud.k8s.k8sserviceprops.md) |  |
|  [Service(propsIn)](./cloud.k8s.service.md) |  |
|  [toK8sPorts(abstractProps)](./cloud.k8s.tok8sports.md) |  |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [ContainerPort](./cloud.k8s.containerport.md) |  |
|  [ContainerSpec](./cloud.k8s.containerspec.md) |  |
|  [CRSpec](./cloud.k8s.crspec.md) |  |
|  [EnvVarFrom](./cloud.k8s.envvarfrom.md) |  |
|  [EnvVarSimple](./cloud.k8s.envvarsimple.md) |  |
|  [K8sContainerProps](./cloud.k8s.k8scontainerprops.md) |  |
|  [Kubeconfig](./cloud.k8s.kubeconfig.md) |  |
|  [Metadata](./cloud.k8s.metadata.md) |  |
|  [PodProps](./cloud.k8s.podprops.md) |  |
|  [PodSpec](./cloud.k8s.podspec.md) |  |
|  [ResourceBase](./cloud.k8s.resourcebase.md) |  |
|  [ResourceCR](./cloud.k8s.resourcecr.md) |  |
|  [ResourceInfo](./cloud.k8s.resourceinfo.md) |  |
|  [ResourcePod](./cloud.k8s.resourcepod.md) |  |
|  [ResourceService](./cloud.k8s.resourceservice.md) |  |
|  [ServiceDeploymentProps](./cloud.k8s.servicedeploymentprops.md) |  |
|  [ServicePort](./cloud.k8s.serviceport.md) |  |
|  [ServiceProps](./cloud.k8s.serviceprops.md) |  |
|  [ServiceSpec](./cloud.k8s.servicespec.md) |  |

## Variables

|  Variable | Description |
|  --- | --- |
|  [podResourceInfo](./cloud.k8s.podresourceinfo.md) |  |
|  [serviceResourceInfo](./cloud.k8s.serviceresourceinfo.md) |  |
|  [toK8sEnv](./cloud.k8s.tok8senv.md) |  |

## Type Aliases

|  Type Alias | Description |
|  --- | --- |
|  [EnvVar](./cloud.k8s.envvar.md) |  |
|  [Kind](./cloud.k8s.kind.md) |  |
|  [ResourceProps](./cloud.k8s.resourceprops.md) |  |
|  [Spec](./cloud.k8s.spec.md) |  |