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

// Lambda - Event Invoke Config
// CF Docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-eventinvokeconfig.html

export interface EventInvokeConfigProps extends WithCredentials {
    destinationConfig?: DestinationConfig;
    functionName: string;
    maximumEventAgeInSeconds?: number;
    maximumRetryAttempts?: number;
    qualifier: string;
}

export interface DestinationConfig {
    OnFailure?: OnFailure;
    OnSuccess?: OnSuccess;
}

export interface OnFailure {
    Destination: string;
}

export interface OnSuccess {
    Destination: string;
}

class EventInvokeConfigNC extends Component<EventInvokeConfigProps> {
    build() {
        const props = this.props;

        const properties = removeUndef({
            DestinationConfig: props.destinationConfig,
            FunctionName: props.functionName,
            MaximumEventAgeInSeconds: props.maximumEventAgeInSeconds,
            MaximumRetryAttempts: props.maximumRetryAttempts,
            Qualifier: props.qualifier
        });

        return (
            <CFResource
                Type="AWS::Lambda::EventInvokeConfig"
                Properties={properties}
            />
        );
    }
}

// tslint:disable-next-line:variable-name
export const EventInvokeConfig = withCredentials(EventInvokeConfigNC);
export default EventInvokeConfig;