import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { AccAddress, bcs } from '@initia/initia.js'
import { BooleanOptionalAction } from 'argparse'
import { ethers } from 'ethers'
import { SHA3 } from 'sha3'

import { INewOperation } from '@layerzerolabs/devtools-extensible-cli'
import {
    deploymentFile,
    getMoveTomlAdminName,
    getNamedAddresses,
    initializeDeployTaskContext,
} from '@layerzerolabs/devtools-move'

class ForwardingDeployOperation implements INewOperation {
    vm = 'move'
    operation = 'deploy-forwarding'
    description = 'Deploy the forwarding contract'
    reqArgs = ['oapp_config']
    addArgs = [
        {
            name: '--upgrade-forwarding',
            arg: {
                help: 'Upgrade the forwarding contract',
                action: BooleanOptionalAction,
                required: false,
            },
        },
    ]

    async impl(args: any): Promise<void> {
        const taskContext = await initializeDeployTaskContext(args.oapp_config)
        const moveTomlAdminName = getMoveTomlAdminName('oft')
        const named_addresses = await getNamedAddresses(
            taskContext.chain,
            taskContext.stage,
            moveTomlAdminName,
            taskContext.selectedContract
        )

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
        if (forwardingExists) {
            if (!args.upgrade_forwarding) {
                console.log('\n🎯 Skipping deploy - forwarding contract already exists')
                return
            }

            console.log('\n🚀 Upgrading forwarding contract')
            await upgradeForwarding(args, named_addresses)
            return
        }

        const deployerAddr = getInitiaAccountAddress()
        const deployerExists = await checkDeployerContractExist(deployerAddr)

        let nonce = 0
        if (deployerExists) {
            nonce = await loadNonce(deployerAddr)
        }

        const forwardingAddr = computeForwardingAddr(AccAddress.toBuffer(deployerAddr), nonce)
        await buildContracts(deployerAddr, forwardingAddr, named_addresses)
        if (!deployerExists) {
            console.log('\n🚀 Deploying deployer contract')
            await deployDeployer()
        } else {
            console.log('\n🎯 Skipping deploy - deployer contract already exists')
        }

        // wait 3s for the deployment to be processed
        await new Promise((resolve) => setTimeout(resolve, 3000))

        // deploy the forwarding contract
        console.log('\n🚀 Deploying forwarding contract')
        await deployForwarding()
        await createDeployment(forwardingAddr, 'Forwarding', taskContext.chain, taskContext.stage)

        console.log('\n✅ Deployment successful ✅')
        console.log(`Forwarding address: ${forwardingAddr}`)
    }
}

const NewOperation = new ForwardingDeployOperation()
export { NewOperation }

async function deployForwarding() {
    const userAccountName = getInitiaKeyName()
    const userAccountAddress = getInitiaAccountAddress()
    const forwardingBytecode = fs.readFileSync(
        `${process.cwd()}/forwarding/build/forwarding/bytecode_modules/forwarding.mv`,
        'binary'
    )
    const forwardingBytecodeHex = Buffer.from(forwardingBytecode, 'binary').toString('hex')

    const cmd = 'initiad'
    const args = [
        'tx',
        'move',
        'execute-json',
        AccAddress.toHex(userAccountAddress),
        'deployer',
        'deploy_forwarding',
        `--args=[["${forwardingBytecodeHex}"]]`,
        `--node=${process.env.INITIA_RPC_URL}`,
        `--from=${userAccountName}`,
        '--gas-prices=0.015uinit',
        '--gas-adjustment=1.4',
        `--chain-id=${process.env.INITIA_CHAIN_ID}`,
        '--gas=auto',
        '--keyring-backend=test',
        '-y',
    ]

    let stdOut = ''
    let stdErr = ''
    return new Promise<void>((resolve, reject) => {
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
                resolve()
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

async function deployDeployer() {
    const userAccountName = getInitiaKeyName()

    const cmd = 'initiad'
    const args = [
        'tx',
        'move',
        'publish',
        `${process.cwd()}/forwarding/build/forwarding/bytecode_modules/deployer.mv`,
        `--node=${process.env.INITIA_RPC_URL}`,
        `--from=${userAccountName}`,
        '--gas-prices=0.015uinit',
        '--gas-adjustment=1.4',
        `--chain-id=${process.env.INITIA_CHAIN_ID}`,
        '--gas=auto',
        '--keyring-backend=test',
        '-y',
    ]

    let stdOut = ''
    let stdErr = ''
    return new Promise<void>((resolve, reject) => {
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
                resolve()
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

async function buildContracts(deployerAddr: string, forwardingAddr: string, named_addresses: string): Promise<void> {
    let stdOut = ''
    let stdErr = ''

    named_addresses += `,deployer=${AccAddress.toHex(deployerAddr)},forwarding=${forwardingAddr}`

    const cmd = 'initiad'
    const args = ['move', 'build', `-p=${process.cwd()}/forwarding`, `--named-addresses=${named_addresses}`]

    return new Promise<void>((resolve, reject) => {
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
                resolve()
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

async function checkIfDeploymentExists(network: string, lzNetworkStage: string, contractName: string) {
    const initiaDir = path.join(process.cwd(), 'deployments', `${network}-${lzNetworkStage}`)
    return fs.existsSync(path.join(initiaDir, `${contractName}.json`))
}

function computeForwardingAddr(deployerAddr: ethers.BytesLike, nonce: number): string {
    if (deployerAddr.length < 32) {
        deployerAddr = ethers.utils.concat([new Uint8Array(32 - deployerAddr.length), deployerAddr])
    }

    const forwardingSeed = new TextEncoder().encode('forwarding')
    const nonceBytes = bcs.u64().serialize(nonce).toBytes()
    const buffer = ethers.utils.concat([deployerAddr, forwardingSeed, nonceBytes, [0xfe]])
    const sha3_256 = new SHA3(256)
    sha3_256.update(Buffer.from(buffer))
    return '0x' + sha3_256.digest('hex')
}

function getInitiaKeyName() {
    if (!process.env.INITIA_KEY_NAME) {
        throw new Error('INITIA_KEY_NAME is not set.\n\nPlease set the INITIA_KEY_NAME environment variable.')
    }
    return process.env.INITIA_KEY_NAME
}

function getInitiaAccountAddress() {
    if (!process.env.INITIA_ACCOUNT_ADDRESS) {
        throw new Error(
            'INITIA_ACCOUNT_ADDRESS is not set.\n\nPlease set the INITIA_ACCOUNT_ADDRESS environment variable.'
        )
    }
    return process.env.INITIA_ACCOUNT_ADDRESS
}

async function createDeployment(deployedAddress: string, file_name: string, network: string, lzNetworkStage: string) {
    fs.mkdirSync('deployments', { recursive: true })
    const initiaDir = `deployments/${network}-${lzNetworkStage}`
    fs.mkdirSync(initiaDir, { recursive: true })

    const deployment: deploymentFile = {
        address: deployedAddress,
        abi: [],
        transactionHash: '',
        receipt: {},
        args: [],
        numDeployments: 1,
        solcInputHash: '',
        metadata: '',
        bytecode: '',
        deployedBytecode: '',
        devdoc: {},
        storageLayout: {},
    }

    fs.writeFileSync(path.join(initiaDir, `${file_name}.json`), JSON.stringify(deployment, null, 2))
}

async function loadNonce(deployerAddr: string): Promise<number> {
    const cmd = 'initiad'
    const args = [
        'query',
        'move',
        'view-json',
        deployerAddr,
        'deployer',
        'nonce',
        `--node=${process.env.INITIA_RPC_URL}`,
        '--output=json',
    ]

    let stdOut = ''
    let stdErr = ''
    return new Promise<number>((resolve, reject) => {
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
                resolve(parseInt(JSON.parse(res['data'])))
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

async function checkDeployerContractExist(deployerAddr: string): Promise<boolean> {
    const cmd = 'initiad'
    const args = ['query', 'move', 'module', deployerAddr, 'deployer', `--node=${process.env.INITIA_RPC_URL}`]

    let stdOut = ''
    let stdErr = ''
    return new Promise<boolean>((resolve, reject) => {
        const childProcess = spawn(cmd, args, {
            stdio: ['inherit', 'pipe', 'pipe'], // Inherit stdin, pipe stdout and stderr
        })

        childProcess.stdout?.on('data', (data) => {
            const dataStr = data.toString()
            stdOut += dataStr
        })

        // Capture stderr (this is actually NOT the error output but the interactive prompt)
        childProcess.stderr?.on('data', (data) => {
            const dataStr = data.toString()
            stdErr += dataStr
        })

        // Handle process close
        childProcess.on('close', (code) => {
            if (code === 0) {
                resolve(true)
            } else {
                if (stdErr.includes('not found')) {
                    resolve(false)
                } else {
                    console.error(`Command failed with code ${code}`)
                    console.error('Captured stderr:', stdErr)
                    reject(new Error(`Process exited with code ${code}`))
                }
            }
        })

        // Handle errors
        childProcess.on('error', (err) => {
            console.error('Error spawning the process:', err)
            reject(err)
        })
    })
}

export async function getDeploymentAddress(network: string, lzNetworkStage: string, contractName: string) {
    const initiaDir = path.join(process.cwd(), 'deployments', `${network}-${lzNetworkStage}`)
    const deploymentPath = path.join(initiaDir, `${contractName}.json`)
    const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
    return deploymentData.address
}

async function upgradeForwarding(args: any, named_addresses: string) {
    const taskContext = await initializeDeployTaskContext(args.oapp_config)
    const forwardingExists = await checkIfDeploymentExists(taskContext.chain, taskContext.stage, 'Forwarding')
    if (!forwardingExists) {
        throw new Error('Deployment for Forwarding contract does not exist. Please deploy the contract first.')
    }

    const deployerAddr = getInitiaAccountAddress()
    const forwardingAddr = await getDeploymentAddress(taskContext.chain, taskContext.stage, 'Forwarding')
    await buildContracts(deployerAddr, forwardingAddr, named_addresses)

    const userAccountName = getInitiaKeyName()
    const forwardingBytecode = fs.readFileSync(
        `${process.cwd()}/forwarding/build/forwarding/bytecode_modules/forwarding.mv`,
        'binary'
    )
    const forwardingBytecodeHex = Buffer.from(forwardingBytecode, 'binary').toString('hex')

    const cmd = 'initiad'
    const executeArgs = [
        'tx',
        'move',
        'execute-json',
        forwardingAddr,
        'forwarding',
        'upgrade',
        `--args=[["${forwardingBytecodeHex}"]]`,
        `--node=${process.env.INITIA_RPC_URL}`,
        `--from=${userAccountName}`,
        '--gas-prices=0.015uinit',
        '--gas-adjustment=1.4',
        `--chain-id=${process.env.INITIA_CHAIN_ID}`,
        '--gas=auto',
        '--keyring-backend=test',
        '-y',
    ]

    let stdOut = ''
    let stdErr = ''
    return new Promise<void>((resolve, reject) => {
        const childProcess = spawn(cmd, executeArgs, {
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
                resolve()
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
