/*
 * Copyright 2020 Unbounded Systems, LLC
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

import Adapt, { Component } from "@adpt/core";
import {removeUndef} from "@adpt/utils";
import {CFResource} from "../CFResource";
import {withCredentials, WithCredentials} from "../credentials";

// Lambda - Layer Version Permission
// CF Docs:
// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-layerversionpermission.html

export interface LayerVersionPermissionProps extends WithCredentials {
    action: string;
    layerVersionArn: string;
    organizationId?: string;
    principal: string;
}

class LayerVersionPermissionNC extends Component<LayerVersionPermissionProps> {
    build() {
        const props = this.props;

        const properties = removeUndef({
            Action: props.action,
            LayerVersionArn: props.layerVersionArn,
            OrganizationId: props.organizationId,
            Principal: props.principal,
        });

        return (
            <CFResource
                Type="AWS::Lambda::LayerVersionPermission"
                Properties={properties}
            />
        );
    }
}

// tslint:disable-next-line:variable-name
export const LayerVersionPermission = withCredentials(LayerVersionPermissionNC);
export default LayerVersionPermission;
