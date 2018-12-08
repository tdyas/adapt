import Adapt, { Component, Handle } from "@usys/adapt";
import { tuple } from "@usys/utils";
import { pick } from "lodash";
import { CFResource } from "./CFResource";
import { withCredentials, WithCredentials } from "./credentials";

export interface EIPAssociationProps extends WithCredentials {
    AllocationId?: string;
    EIP?: string;
    InstanceId?: string | Handle;
    NetworkInterfaceId?: string;
    PrivateIpAddress?: string;
}

const resourceProps = tuple(
    "AllocationId",
    "EIP",
    "InstanceId",
    "NetworkInterfaceId",
    "PrivateIpAddress",
);

class EIPAssociationNC extends Component<EIPAssociationProps> {
    build() {
        const properties = pick(this.props, resourceProps);

        return <CFResource Type="AWS::EC2::EIPAssociation" Properties={properties} />;
    }
}

// tslint:disable-next-line:variable-name
export const EIPAssociation = withCredentials(EIPAssociationNC);
export default EIPAssociation;