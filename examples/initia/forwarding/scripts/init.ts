import { AptosEVMCLI } from '@layerzerolabs/devtools-extensible-cli/cli/AptosEVMCli'

import { NewOperation as ForwardingDeployOperation } from './operations/deploy-forwarding'
import { NewOperation as RegisterOFTMetadataOnForwardingOperation } from './operations/register-oft-metadata-on-forwarding'
import { NewOperation as SendForwardingOperation } from './operations/send-forwarding'
import { NewOperation as SendNativeForwardingOperation } from './operations/send-native-forwarding'

export async function attach_wire_forwarding(sdk: AptosEVMCLI) {
    await sdk.extendOperation(ForwardingDeployOperation)
    await sdk.extendOperation(SendForwardingOperation)
    await sdk.extendOperation(SendNativeForwardingOperation)
    await sdk.extendOperation(RegisterOFTMetadataOnForwardingOperation)
}
