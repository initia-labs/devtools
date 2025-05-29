import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { INewOperation } from '@layerzerolabs/devtools-extensible-cli'
import { initializeDeployTaskContext } from '@layerzerolabs/devtools-move'

import { checkIfDeploymentExists } from './send-native-forwarding'

class RegisterOFTMetadataOnForwardingOperation implements INewOperation {
    vm = 'move'
    operation = 'register-oft-metadata-on-forwarding'
    description = 'Register OFT metadata to the forwarding contract'
    reqArgs = ['oapp_config']
    addArgs = []

    async impl(args: any): Promise<void> {
        const taskContext = await initializeDeployTaskContext(args.oapp_config)
        const forwardingExists = await checkIfDeploymentExists(taskContext.chain, taskContext.stage, 'Forwarding')
        if (!forwardingExists) {
            throw new Error('Deployment for Forwarding contract does not exist. Please deploy the contract first.')
        }

        const moveOFTAddr = await getDeploymentAddress(
            taskContext.chain,
            taskContext.stage,
            taskContext.selectedContract.contract.contractName ?? ''
        )
        const oftMetadata = await getOFTMetadata(moveOFTAddr)
        const forwardingAddr = await getDeploymentAddress(taskContext.chain, taskContext.stage, 'Forwarding')
        if (await checkOFTMetadataRegistered(forwardingAddr, moveOFTAddr)) {
            console.log('\n🎯 Skipping register - OFT metadata already registered')
            return
        }

        console.log('\n🚀 Registering OFT metadata')
        await registerOFTMetadata(forwardingAddr, moveOFTAddr, oftMetadata)
    }
}

const NewOperation = new RegisterOFTMetadataOnForwardingOperation()
export { NewOperation }

async function registerOFTMetadata(forwardingAddr: string, oftAddr: string, metadata: string) {
    const userAccountName = getInitiaKeyName()

    const cmd = 'initiad'
    const args = [
        'tx',
        'move',
        'execute-json',
        forwardingAddr,
        'forwarding',
        'set_oft_metadata',
        `--args=["${oftAddr}", "${metadata}"]`,
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

async function checkOFTMetadataRegistered(forwardingAddr: string, oftAddr: string): Promise<boolean> {
    const cmd = 'initiad'
    const args = [
        'query',
        'move',
        'view-json',
        forwardingAddr,
        'forwarding',
        'oft_metadata',
        `--args=["${oftAddr}"]`,
        `--node=${process.env.INITIA_RPC_URL}`,
        '--output=json',
    ]

    let stdOut = ''
    let stdErr = ''
    return new Promise<boolean>((resolve, reject) => {
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
                resolve(true)
            } else {
                if (stdErr.includes('code=65542')) {
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

async function getOFTMetadata(oftAddr: string): Promise<string> {
    const cmd = 'initiad'
    const args = [
        'query',
        'move',
        'view-json',
        oftAddr,
        'oft',
        'metadata',
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
        })

        // Capture stderr (this is actually NOT the error output but the interactive prompt)
        childProcess.stderr?.on('data', (data) => {
            const dataStr = data.toString()
            stdErr += dataStr
        })

        // Handle process close
        childProcess.on('close', (code) => {
            if (code === 0) {
                const res = JSON.parse(stdOut)
                resolve(JSON.parse(res['data']))
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

export async function getDeploymentAddress(network: string, lzNetworkStage: string, contractName: string) {
    const initiaDir = path.join(process.cwd(), 'deployments', `${network}-${lzNetworkStage}`)
    const deploymentPath = path.join(initiaDir, `${contractName}.json`)
    const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
    return deploymentData.address
}

function getInitiaKeyName() {
    if (!process.env.INITIA_KEY_NAME) {
        throw new Error('INITIA_KEY_NAME is not set.\n\nPlease set the INITIA_KEY_NAME environment variable.')
    }
    return process.env.INITIA_KEY_NAME
}
