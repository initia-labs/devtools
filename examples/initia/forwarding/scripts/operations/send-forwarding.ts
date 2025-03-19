import { ethers } from 'ethers'

import { INewOperation } from '@layerzerolabs/devtools-extensible-cli'
import { createEvmOmniContracts, initializeDeployTaskContext, readPrivateKey } from '@layerzerolabs/devtools-move'
import { Options } from '@layerzerolabs/lz-v2-utilities'

import {
    MessagingFee,
    SendParam,
    buildComposerMessage,
    checkIfDeploymentExists,
    getDeploymentAddress,
} from './send-native-forwarding'

class SendForwardingOperation implements INewOperation {
    vm = 'evm'
    operation = 'send-forwarding'
    description = 'Send OFT token from EVM to the forwarding contract'
    reqArgs = ['oapp_config', 'src_eid', 'dst_eid', 'to', 'ibc_channel', 'amount', 'min_amount']
    addArgs = [
        {
            name: '--src-eid',
            arg: {
                help: 'The source endpoint ID',
                required: false,
            },
        },
        {
            name: '--dst-eid',
            arg: {
                help: 'The destination endpoint ID',
                required: false,
            },
        },
        {
            name: '--to',
            arg: {
                help: 'The address to send the message to',
                required: false,
            },
        },
        {
            name: '--ibc-channel',
            arg: {
                help: 'The IBC channel to send the message to',
                required: false,
            },
        },
        {
            name: '--amount',
            arg: {
                help: 'The amount to send',
                required: false,
            },
        },
        {
            name: '--min-amount',
            arg: {
                help: 'The minimum amount to send',
                required: false,
            },
        },
        {
            name: '--refund-address',
            arg: {
                help: 'The address to refund the gas fee to',
                required: false,
            },
        },
    ]

    async impl(args: any): Promise<void> {
        const taskContext = await initializeDeployTaskContext(args.oapp_config)
        const deploymentExists = await checkIfDeploymentExists(
            taskContext.chain,
            taskContext.stage,
            taskContext.selectedContract.contract.contractName ?? ''
        )
        if (!deploymentExists) {
            throw new Error(
                `Deployment for ${taskContext.selectedContract.contract.contractName} does not exist. Please deploy the contract first.`
            )
        }

        const forwardingExists = await checkIfDeploymentExists(taskContext.chain, taskContext.stage, 'Forwarding')
        if (!forwardingExists) {
            throw new Error('Deployment for Forwarding contract does not exist. Please deploy the contract first.')
        }

        const moveOFTAddr = await getDeploymentAddress(
            taskContext.chain,
            taskContext.stage,
            taskContext.selectedContract.contract.contractName ?? ''
        )
        const forwardingAddr = await getDeploymentAddress(taskContext.chain, taskContext.stage, 'Forwarding')

        await sendOFT(args, moveOFTAddr, forwardingAddr)
    }
}

const NewOperation = new SendForwardingOperation()
export { NewOperation }

async function sendOFT(args: any, moveOFTAddr: string, forwardingAddr: string): Promise<MessagingFee> {
    const srcEid = args.src_eid
    const dstEid = args.dst_eid
    const amount = args.amount
    const minAmount = args.min_amount
    const ibcChannel = args.ibc_channel
    const to = args.to

    const privateKey = readPrivateKey(args)
    const omniContracts = await createEvmOmniContracts(args, privateKey)
    let oft: ethers.Contract
    const contract = omniContracts[srcEid.toString()]
    if (contract?.contract?.oapp) {
        oft = contract.contract.oapp
    } else {
        throw new Error(`No OApp found for endpoint ID ${srcEid}`)
    }
    const fromAddress = await oft.signer.getAddress()
    const refundAddress = args.refund_address || fromAddress

    console.log(`\n🚀 Sending ${amount} units`)
    console.log(`\t📝 Using OFT at address: ${oft.address}`)
    console.log(`\t👤 From account: ${fromAddress}`)
    console.log(`\t🎯 To account: ${to}`)
    console.log(`\t🔗 IBC channel: ${ibcChannel}`)
    console.log(`\t🌐 srcEid: ${srcEid}`)
    console.log(`\t🌐 dstEid: ${dstEid}`)
    console.log(`\t🔍 Amount: ${amount}`)
    console.log(`\t🔍 Min amount: ${minAmount}`)

    const options = Options.newOptions().addExecutorLzReceiveOption(500_000).addExecutorComposeOption(0, 800_000)
    const composerPayload = await buildComposerMessage(moveOFTAddr, fromAddress, to, ibcChannel, amount)
    const sendParam: SendParam = {
        dstEid: dstEid,
        to: forwardingAddr,
        amountLD: amount,
        minAmountLD: minAmount,
        extraOptions: options.toHex(),
        composeMsg: composerPayload,
        oftCmd: '0x',
    }

    const fee: MessagingFee = await oft.quoteSend(sendParam, false)

    console.log('\n💰 Quote received:')
    console.log('\t🏦 Native fee:', fee.nativeFee.toString())
    console.log('\t🪙 LZ token fee:', fee.lzTokenFee.toString())

    const approvalRequired = await oft.approvalRequired()
    if (approvalRequired) {
        const ERC20ABI = [
            'function approve(address _spender, uint256 _value) public returns (bool success)',
            'function allowance(address _owner, address _spender) public view returns (uint256 remaining)',
        ]
        const tokenAddress = await oft.token()
        const erc20Token = new ethers.Contract(tokenAddress, ERC20ABI, oft.signer)

        const allowance = await erc20Token.allowance(await oft.signer.getAddress(), oft.address)
        if (allowance < amount) {
            console.log('\n🔑 Approval required for OFT')

            const approvalTxResponse = await erc20Token.approve(oft.address, amount)
            const approvalTxReceipt = await approvalTxResponse.wait()
            console.log(`\nApproved: ${amount} units`)
            console.log(`\t🔑 Hash: ${approvalTxReceipt.transactionHash}`)
        }
    }

    const tx = await oft.send(sendParam, fee, refundAddress, {
        value: fee.nativeFee,
    })

    console.log('\n📨 Transaction sent:')
    console.log('\t🔑 Hash:', tx.hash)
    console.log('\t🔍 LayerZero Explorer:', `https://layerzeroscan.com/tx/${tx.hash}`)
    console.log('\t📤 From:', tx.from)
    console.log('\t📥 To:', tx.to)
    console.log('\t💵 Value:', ethers.utils.formatEther(tx.value), 'ETH')
    console.log('\t⛽ Gas limit:', tx.gasLimit.toString())

    return tx
}
