import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'

import type { OAppOmniGraphHardhat, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

enum MsgType {
    SEND = 1,
    SEND_AND_CALL = 2,
}

const ethContract: OmniPointHardhat = {
    eid: EndpointId.ETHEREUM_V2_MAINNET,
    contractName: 'MyOFT',
}

const baseContract: OmniPointHardhat = {
    eid: EndpointId.BASE_V2_MAINNET,
    contractName: 'MyOFT',
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
                owner: '0x4DFF76C3Eb3617b3Ce5fcdCeBEAAF432a5D5a187',
                delegate: '0x4DFF76C3Eb3617b3Ce5fcdCeBEAAF432a5D5a187',
            },
        },
        {
            contract: initiaContract,
            config: {
                delegate: '0x4DFF76C3Eb3617b3Ce5fcdCeBEAAF432a5D5a187',
                owner: '0x4DFF76C3Eb3617b3Ce5fcdCeBEAAF432a5D5a187',
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
                //     lib: '0x5aab6aa28749dd073c26c4703e14eb7e89dd6a25abc2e1f0e98de59f8203a012',
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
                        requiredDVNs: [
                            '0xd8717e05c622a366394bedb326ca10e6a34b25df20ec9b572382b65c8a68461f',
                            '0x6ae3cd90d5b75e89f8b223412a419d1a9f8848cdcdc99ce85b71040946aab376',
                        ],
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
                        confirmations: BigInt(10),
                        // The address of the DVNs your `receiveConfig` expects to receive verifications from on the `from` chain.
                        // The `from` chain's OApp will wait until the configured threshold of `requiredDVNs` verify the message.
                        requiredDVNs: [
                            '0xd8717e05c622a366394bedb326ca10e6a34b25df20ec9b572382b65c8a68461f',
                            '0x6ae3cd90d5b75e89f8b223412a419d1a9f8848cdcdc99ce85b71040946aab376',
                        ],
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
            from: initiaContract,
            to: baseContract,
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
                //     lib: '0x5aab6aa28749dd073c26c4703e14eb7e89dd6a25abc2e1f0e98de59f8203a012',
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
                        requiredDVNs: [
                            '0xd8717e05c622a366394bedb326ca10e6a34b25df20ec9b572382b65c8a68461f',
                            '0x6ae3cd90d5b75e89f8b223412a419d1a9f8848cdcdc99ce85b71040946aab376',
                        ],
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
                        confirmations: BigInt(10),
                        // The address of the DVNs your `receiveConfig` expects to receive verifications from on the `from` chain.
                        // The `from` chain's OApp will wait until the configured threshold of `requiredDVNs` verify the message.
                        requiredDVNs: [
                            '0xd8717e05c622a366394bedb326ca10e6a34b25df20ec9b572382b65c8a68461f',
                            '0x6ae3cd90d5b75e89f8b223412a419d1a9f8848cdcdc99ce85b71040946aab376',
                        ],
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
                //     lib: '0xc02Ab410f0734EFa3F14628780e6e695156024C2',
                //     expiry: BigInt(67323472),
                // },
                sendConfig: {
                    executorConfig: {
                        maxMessageSize: 10_000,
                        executor: '0x173272739Bd7Aa6e4e214714048a9fE699453059',
                    },
                    ulnConfig: {
                        confirmations: BigInt(10),
                        requiredDVNs: [
                            '0x589dedbd617e0cbcb916a9223f4d1300c294236b',
                            '0xa59ba433ac34d2927232918ef5b2eaafcf130ba5',
                        ],
                        optionalDVNThreshold: 0,
                    },
                },
                receiveConfig: {
                    ulnConfig: {
                        confirmations: BigInt(10),
                        requiredDVNs: [
                            '0x589dedbd617e0cbcb916a9223f4d1300c294236b',
                            '0xa59ba433ac34d2927232918ef5b2eaafcf130ba5',
                        ],
                        optionalDVNThreshold: 0,
                    },
                },
            },
        },
        {
            from: baseContract,
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
                sendLibrary: '0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2',
                receiveLibraryConfig: {
                    receiveLibrary: '0xc70AB6f32772f59fBfc23889Caf4Ba3376C84bAf',
                    gracePeriod: BigInt(0),
                },
                // receiveLibraryTimeoutConfig: {
                //     lib: '0xc02Ab410f0734EFa3F14628780e6e695156024C2',
                //     expiry: BigInt(67323472),
                // },
                sendConfig: {
                    executorConfig: {
                        maxMessageSize: 10_000,
                        executor: '0x2CCA08ae69E0C44b18a57Ab2A87644234dAebaE4',
                    },
                    ulnConfig: {
                        confirmations: BigInt(10),
                        requiredDVNs: [
                            '0x9e059a54699a285714207b43b055483e78faac25',
                            '0xcd37ca043f8479064e10635020c65ffc005d36f6',
                        ],
                        optionalDVNThreshold: 0,
                    },
                },
                receiveConfig: {
                    ulnConfig: {
                        confirmations: BigInt(10),
                        requiredDVNs: [
                            '0x9e059a54699a285714207b43b055483e78faac25',
                            '0xcd37ca043f8479064e10635020c65ffc005d36f6',
                        ],
                        optionalDVNThreshold: 0,
                    },
                },
            },
        },
    ],
}

export default config
