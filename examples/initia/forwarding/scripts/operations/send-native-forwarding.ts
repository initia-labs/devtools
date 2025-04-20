import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { AccAddress } from '@initia/initia.js'
import { ethers } from 'ethers'

import { INewOperation } from '@layerzerolabs/devtools-extensible-cli'
import { createEvmOmniContracts, initializeDeployTaskContext, readPrivateKey } from '@layerzerolabs/devtools-move'
import { Options } from '@layerzerolabs/lz-v2-utilities'

class SendNativeForwardingOperation implements INewOperation {
    vm = 'evm'
    operation = 'send-native-forwarding'
    description = 'Send Native token from EVM to the forwarding contract'
    reqArgs = ['oapp_config', 'src_eid', 'dst_eid', 'to', 'amount', 'min_amount']
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
            name: '--op-bridge-id',
            arg: {
                help: 'The OP bridge ID to send the message to',
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

const NewOperation = new SendNativeForwardingOperation()
export { NewOperation }

async function sendOFT(args: any, moveOFTAddr: string, forwardingAddr: string): Promise<MessagingFee> {
    const srcEid = args.src_eid
    const dstEid = args.dst_eid
    const amount = args.amount
    const minAmount = args.min_amount
    const ibcChannel = args.ibc_channel
    const opBridgeId = args.op_bridge_id
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
    let composerPayload: string
    if (opBridgeId) {
        composerPayload = await buildOPBridgeComposerMessage(moveOFTAddr, fromAddress, to, opBridgeId, amount)
    } else if (ibcChannel) {
        composerPayload = await buildComposerMessage(moveOFTAddr, fromAddress, to, ibcChannel, amount)
    } else {
        throw new Error('Either --op-bridge-id or --ibc-channel must be provided')
    }
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
    const nativeAmountToSend: bigint = BigInt(fee.nativeFee) + BigInt(amount)

    console.log('\n💰 Quote received:')
    console.log('\t🏦 Native Amount:', nativeAmountToSend.toString())
    console.log('\t🏦 Native fee:', fee.nativeFee.toString())
    console.log('\t🪙 LZ token fee:', fee.lzTokenFee.toString())

    const tx = await oft.send(sendParam, fee, refundAddress, {
        value: nativeAmountToSend,
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

export type SendParam = {
    dstEid: number
    to: string
    amountLD: number
    minAmountLD: number
    extraOptions: string
    composeMsg: string
    oftCmd: string
}

export type MessagingFee = {
    nativeFee: bigint
    lzTokenFee: bigint
}

export async function buildOPBridgeComposerMessage(
    moveOFTAddr: string,
    fromAddr: string,
    receiverAddr: string,
    opBridgeId: string,
    amount: string
): Promise<string> {
    const amountSD = ethers.BigNumber.from(amount).div(ethers.BigNumber.from(10).pow(12))
    const moveDenom = await loadMoveDenom(moveOFTAddr)
    const fromInitAddr = AccAddress.fromHex(fromAddr)
    const receiverInitiaAddr = AccAddress.fromHex(receiverAddr)
    const composePayload = `
{
  "@type": "/opinit.ophost.v1.MsgInitiateTokenDeposit",
  "sender": "${fromInitAddr}",
  "bridge_id": "${opBridgeId}",
  "to": "${receiverInitiaAddr}",
  "amount": {
    "denom": "${moveDenom}",
    "amount": "${amountSD.toString()}"
  },
  "data": ""
}
    `
        .replace(/\s/g, '')
        .replace(/\n/g, '')

    console.info(`\nComposer Message: ${composePayload}`)
    return '0x' + Buffer.from(composePayload, 'utf-8').toString('hex')
}

export async function buildComposerMessage(
    moveOFTAddr: string,
    fromAddr: string,
    receiverAddr: string,
    ibcChannel: string,
    amount: string
): Promise<string> {
    const amountSD = ethers.BigNumber.from(amount).div(ethers.BigNumber.from(10).pow(12))
    const moveDenom = await loadMoveDenom(moveOFTAddr)
    const fromInitAddr = AccAddress.fromHex(fromAddr)
    const receiverInitiaAddr = AccAddress.fromHex(receiverAddr)
    const timeout = (new Date().getTime() + 60 * 30 * 1000) * 1000000
    const composePayload = `
{
  "@type": "/ibc.applications.transfer.v1.MsgTransfer",
  "source_port": "transfer",
  "source_channel": "${ibcChannel}",
  "token": {
    "denom": "${moveDenom}",
    "amount": "${amountSD.toString()}"
  },
  "sender": "${fromInitAddr}",
  "receiver": "${receiverInitiaAddr}",
  "timeout_height": {
    "revision_number": "0",
    "revision_height": "0"
  },
  "timeout_timestamp": "${timeout}",
  "memo": ""
}
    `
        .replace(/\s/g, '')
        .replace(/\n/g, '')

    console.info(`\nComposer Message: ${composePayload}`)
    return '0x' + Buffer.from(composePayload, 'utf-8').toString('hex')
}

export async function loadMoveDenom(oftAddr: string): Promise<string> {
    const cmd = 'initiad'
    const args = [
        'query',
        'move',
        'resource',
        oftAddr,
        `${oftAddr}::oft_fa::OftImpl`,
        `--node=${process.env.INITIA_RPC_URL}`,
        '--output=json',
    ]

    let stdOut = ''
    let stdErr = ''
    return new Promise<string>((resolve, reject) => {
        const childProcess = spawn(cmd, args, {
            stdio: ['inherit', 'pipe', 'pipe'], // Inherit stdin, pipe stdout and stderr
        })

        // Capture stdout which contains our deployed address
        childProcess.stdout?.on('data', (data) => {
            const dataStr = data.toString()
            stdOut += dataStr
            process.stdout.write(`${dataStr}`)
        })

        // Capture stderr (this is actually NOT the error output but the interactive prompt)
        childProcess.stderr?.on('data', (data) => {
            const dataStr = data.toString()
            stdErr += dataStr
            process.stderr.write(`${dataStr}`)
        })

        // Handle process close
        childProcess.on('close', (code) => {
            if (code === 0) {
                const res = JSON.parse(stdOut)
                const moveResource = JSON.parse(res['resource']['move_resource'])
                const moveDenom = `move/${moveResource['data']['transfer_ref']['metadata']['inner'].replace('0x', '')}`
                resolve(moveDenom)
            } else {
                console.error(`Command failed with code ${code}`)
                console.error('Captured stderr:', stdErr)
                reject(new Error(`Process exited with code ${code}`))
            }
        })

        // Handle errors
        childProcess.on('error', (err) => {
            console.error('Error spawning the process:', err)
            reject(err)
        })
    })
}

export async function checkIfDeploymentExists(network: string, lzNetworkStage: string, contractName: string) {
    const initiaDir = path.join(process.cwd(), 'deployments', `${network}-${lzNetworkStage}`)
    return fs.existsSync(path.join(initiaDir, `${contractName}.json`))
}

export async function getDeploymentAddress(network: string, lzNetworkStage: string, contractName: string) {
    const initiaDir = path.join(process.cwd(), 'deployments', `${network}-${lzNetworkStage}`)
    const deploymentPath = path.join(initiaDir, `${contractName}.json`)
    const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
    return deploymentData.address
}
