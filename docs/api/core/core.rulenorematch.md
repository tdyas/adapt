---
id: core.rulenorematch
title: ruleNoRematch() function
hide_title: true
---
<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[@adpt/core](./core.md) &gt; [ruleNoRematch](./core.rulenorematch.md)

## ruleNoRematch() function

User API function that can be used in a style rule build function to mark the props of the passed in element such that the rule associated with the info parameter will not match against the specified element.

This works by copying the set of all rules that have already matched successfully against the original element (origElement) specified in the info parameter onto the passed in elem. Returns the passed in elem as a convenience. Does not create a new element.

<b>Signature:</b>

```typescript
export declare function ruleNoRematch(info: StyleBuildInfo, elem: jsx.AdaptElement): jsx.AdaptElement<jsx.AnyProps>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  info | <code>StyleBuildInfo</code> |  |
|  elem | <code>jsx.AdaptElement</code> |  |

<b>Returns:</b>

`jsx.AdaptElement<jsx.AnyProps>`