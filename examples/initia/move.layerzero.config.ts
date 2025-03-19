import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'

import type { OAppOmniGraphHardhat, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

enum MsgType {
    SEND = 1,
    SEND_AND_CALL = 2,
}

const ethContract: OmniPointHardhat = {
    eid: EndpointId.ETHEREUM_V2_MAINNET,
    contractName: 'MyOFTAdapter',
}

const initiaContract: OmniPointHardhat = {
    eid: EndpointId.INITIA_V2_MAINNET,
    contractName: 'MyOFT',
}

const config: OAppOmniGraphHardhat = {
    contracts: [
        {
            contract: ethContract,
            config: {
                owner: '0x8a3da5F6F8f5B6A9D4fF5B5Fa9339aB6e825e569',
                delegate: '0x8a3da5F6F8f5B6A9D4fF5B5Fa9339aB6e825e569',
            },
        },
        {
            contract: initiaContract,
            config: {
                delegate: '0x0BD516796ECF8246F0702BAE478A559A18B75B91',
                owner: '0x0BD516796ECF8246F0702BAE478A559A18B75B91',
            },
        },
    ],
    connections: [
        {
            from: initiaContract,
            to: ethContract,
            config: {
                enforcedOptions: [
                    {
                        msgType: MsgType.SEND,
                        optionType: ExecutorOptionType.LZ_RECEIVE,
                        gas: 80_000, // gas limit in wei for EndpointV2.lzReceive
                        value: 0, // msg.value in wei for EndpointV2.lzReceive
                    },
                    {
                        msgType: MsgType.SEND_AND_CALL,
                        optionType: ExecutorOptionType.LZ_RECEIVE,
                        gas: 80_000, // gas limit in wei for EndpointV2.lzReceive
                        value: 0, // msg.value in wei for EndpointV2.lzReceive
                    },
                ],
                sendLibrary: '0x5aab6aa28749dd073c26c4703e14eb7e89dd6a25abc2e1f0e98de59f8203a012',
                receiveLibraryConfig: {
                    // Required Receive Library Address on Initia
                    receiveLibrary: '0x5aab6aa28749dd073c26c4703e14eb7e89dd6a25abc2e1f0e98de59f8203a012',
                    // Optional Grace Period for Switching Receive Library Address on Initia
                    gracePeriod: BigInt(0),
                },
                // Optional Receive Library Timeout for when the Old Receive Library Address will no longer be valid on Initia
                // receiveLibraryTimeoutConfig: {
                //     lib: '0x3e1b182c40965a986133798e1da76302ef327de2c32c58110361587560285e88',
                //     expiry: BigInt(1000000000),
                // },
                sendConfig: {
                    executorConfig: {
                        maxMessageSize: 10_000,
                        // The configured Executor address on Initia
                        executor: '0xaa3f42a2955bec10bb58b7d95aa2e7471499e26b220c92aced179041f152c8b7',
                    },
                    ulnConfig: {
                        // The number of block confirmations to wait on Initia before emitting the message from the source chain.
                        confirmations: BigInt(10),
                        // The address of the DVNs you will pay to verify a sent message on the source chain.
                        // The destination tx will wait until ALL `requiredDVNs` verify the message.
                        requiredDVNs: ['0xd8717e05c622a366394bedb326ca10e6a34b25df20ec9b572382b65c8a68461f'],
                        // The address of the DVNs you will pay to verify a sent message on the source chain.
                        // The destination tx will wait until the configured threshold of `optionalDVNs` verify a message.
                        optionalDVNs: [],
                        // The number of `optionalDVNs` that need to successfully verify the message for it to be considered Verified.
                        optionalDVNThreshold: 0,
                    },
                },
                // Optional Receive Configuration
                // @dev Controls how the `from` chain receives messages from the `to` chain.
                receiveConfig: {
                    ulnConfig: {
                        // The number of block confirmations to expect from the `to` chain.
                        confirmations: BigInt(5),
                        // The address of the DVNs your `receiveConfig` expects to receive verifications from on the `from` chain.
                        // The `from` chain's OApp will wait until the configured threshold of `requiredDVNs` verify the message.
                        requiredDVNs: ['0xd8717e05c622a366394bedb326ca10e6a34b25df20ec9b572382b65c8a68461f'],
                        // The address of the `optionalDVNs` you expect to receive verifications from on the `from` chain.
                        // The destination tx will wait until the configured threshold of `optionalDVNs` verify the message.
                        optionalDVNs: [],
                        // The number of `optionalDVNs` that need to successfully verify the message for it to be considered Verified.
                        optionalDVNThreshold: 0,
                    },
                },
            },
        },
        {
            from: ethContract,
            to: initiaContract,
            config: {
                enforcedOptions: [
                    {
                        msgType: MsgType.SEND,
                        optionType: ExecutorOptionType.LZ_RECEIVE,
                        gas: 5_000, // gas limit in wei for EndpointV2.lzReceive
                        value: 0, // msg.value in wei for EndpointV2.lzReceive
                    },
                    {
                        msgType: MsgType.SEND_AND_CALL,
                        optionType: ExecutorOptionType.LZ_RECEIVE,
                        gas: 5_000, // gas limit in wei for EndpointV2.lzCompose
                        value: 0, // msg.value in wei for EndpointV2.lzCompose
                    },
                ],
                sendLibrary: '0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1',
                receiveLibraryConfig: {
                    receiveLibrary: '0xc02Ab410f0734EFa3F14628780e6e695156024C2',
                    gracePeriod: BigInt(0),
                },
                // receiveLibraryTimeoutConfig: {
                //     lib: '0x188d4bbCeD671A7aA2b5055937F79510A32e9683',
                //     expiry: BigInt(67323472),
                // },
                sendConfig: {
                    executorConfig: {
                        maxMessageSize: 10_000,
                        executor: '0x173272739Bd7Aa6e4e214714048a9fE699453059',
                    },
                    ulnConfig: {
                        confirmations: BigInt(5),
                        requiredDVNs: ['0x589dedbd617e0cbcb916a9223f4d1300c294236b'],
                        optionalDVNThreshold: 0,
                    },
                },
                receiveConfig: {
                    ulnConfig: {
                        confirmations: BigInt(10),
                        requiredDVNs: ['0x589dedbd617e0cbcb916a9223f4d1300c294236b'],
                        optionalDVNThreshold: 0,
                    },
                },
            },
        },
    ],
}

export default config
