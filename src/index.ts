import  { Client }  from 'ssh2';
import { SSHAgentDeamon } from './ssh-agent';
import fs from 'fs';
import { SSHAgentClient } from './ssh-agent/client';
import { debug as d } from 'debug';

d.formatters.b = (v) => v.toString('base64');
const debug = d('ssh');

export interface HostData {
    host?: {
        hostname: string,
        port: number,
    },
    username?: string,
    privateKey?: string,
}

export interface AboutSSH {
    target: HostData,
    bastion: HostData,
    //webRoot?: string,
    /**
     * Directory or directories (then user has to select) to update, relative to webRoot
     */
    //webDir?: string | string[],
    //archiveRoot?: string
    personalConfig: string,
}

export interface SSHConnected {
    bastion?: Client,
    target: Client,
} 

export function connect(aboutSSH: Partial<AboutSSH>): Promise<SSHConnected>{
    if(aboutSSH.bastion){
        return connectViaBastion(aboutSSH);
    } else return directConnection(aboutSSH);
}

async function connectViaBastion(aboutSSH: Partial<AboutSSH>): Promise<SSHConnected>{
    const bastionHost = aboutSSH.bastion?.host;
    if(!bastionHost) throw new Error('No data about bastion host');
    const bastionUsername = aboutSSH.bastion?.username;
    if(!bastionUsername) throw new Error('No bastion username');
    const bastionKey = aboutSSH.bastion?.privateKey;
    if(!bastionKey) throw new Error('No bastion key');

    const targetHost = aboutSSH.target?.host;
    if(!targetHost) throw new Error('No data about target host');
    const targetUsername = aboutSSH.target?.username;
    if(!targetUsername) throw new Error('No target username');
    const targetKey = aboutSSH.target?.privateKey;
    if(!targetKey) throw new Error('No target key');
    
    const sshBastion = new Client();

    //start ssh-agent
    const sshAgentD = new SSHAgentDeamon();
    const fileSocket = await sshAgentD.start();
    
    const sshAgentClient = new SSHAgentClient(fileSocket);
    const targetKeyBlob = fs.readFileSync(targetKey);
    await sshAgentClient.add_key(targetKeyBlob);

    return new Promise<SSHConnected>( (resolve, reject ) => {

        sshBastion.connect({
            readyTimeout: 5000,
            host: bastionHost.hostname,
            port: bastionHost.port,
            username: bastionUsername,
            privateKey: fs.readFileSync( bastionKey ),
            hostVerifier: (keyHash, callback) => {
                debug('Bastion key is automatically accepted: %b', keyHash);
                callback(true);
            }
        })
        .on('error', e => {
            const error = new Error(`Jump host error: ${e}`);
            reject(error);
        })
        .on('ready', () => {
            debug('FIRST :: connection ready');
            // Alternatively, you could use something like netcat or socat with exec()
            // instead of forwardOut(), depending on what the server allows
            //`nc prod80-nsc.agiloft.com 22`
            //sshTarget.exec('ncat prod80-nsc.agiloft.com 22', (err, stream) => { //ncat on Fedora
            const forward = {
                srcIp: '127.0.0.1',
                srcPort: 45554,
            }
            sshBastion.forwardOut(forward.srcIp, forward.srcPort, targetHost.hostname, targetHost.port,  (err, stream) => {
                if (err) {
                    sshBastion.end();
                    const err = new Error(`Jump host has failed to forward source ${forward.srcIp}:${forward.srcPort} to destination ${targetHost.hostname}:${targetHost.port}`)
                    return reject(err);
                }
                debug(`Connecting to ${targetHost.hostname}:${targetHost.port}`);
                try {
                    const sshTarget = new Client();
                    sshTarget
                    .on('ready', () => {
                        sshAgentD.stop();
                        debug('SECOND :: connection ready');
                        resolve({bastion: sshBastion, target: sshTarget});
                        /*
                        if(!aboutSSH.webRoot) throw new Error('webRoot is undefiend');
                        else {
                            const webRoot = aboutSSH.webRoot;
                            sshTarget.sftp((err, sftp) => {
                                if (err) throw err;
                                sftp.readdir(webRoot, (err, list) => {
                                    if (err) throw err;
                                    console.dir(list);
                                    sshBastion.end();
                                });
                            });
                        }*/
                        /*
                        conn2.exec('uptime', (err, stream) => {
                        if (err) {
                            console.log('SECOND :: exec error: ' + err);
                            return conn1.end();
                        }
                        */
                        stream.on('close', () => {
                            sshBastion.end(); // close parent (and this) connection
                        });
                        /*
                        .on('data', (data) => {
                            console.log(data.toString());
                        });
                        });
                        */
                    })
                    .on('error', e => {
                        debug('Target connection error');
                        sshTarget.end();
                        reject(e);
                    })
                    .on('end', () => {
                        sshBastion.end();
                    })
                    .connect({
                        sock: stream,
                        host: targetHost.hostname,
                        port: targetHost.port,
                        username: targetUsername,
                        privateKey: fs.readFileSync( targetKey ),
                        agentForward: true,
                        agent: fileSocket,
                        hostVerifier: (keyHash, callback) => {
                            debug('Target key is automatically accepted: %b', keyHash );
                            callback(true);
                        }
                    });
                } catch(e){
                    const error = new Error(`Connection failed from ${bastionHost.hostname} to ${targetHost.hostname}:${targetHost.port}`);
                    reject(error);
                }
            });
        });
    });
}

async function directConnection(aboutSSH: Partial<AboutSSH>): Promise<SSHConnected>{

    const targetHost = aboutSSH.target?.host;
    if(!targetHost) throw new Error('No data about target host');
    const targetUsername = aboutSSH.target?.username;
    if(!targetUsername) throw new Error('No target username');
    const targetKey = aboutSSH.target?.privateKey;
    if(!targetKey) throw new Error('No target key');

    const sshDirect = new Client();


    return new Promise<SSHConnected>( (resolve, reject ) => {

        sshDirect.connect({
            readyTimeout: 5000,
            host: targetHost.hostname,
            port: targetHost.port,
            username: targetUsername,
            privateKey: fs.readFileSync( targetKey ),
            hostVerifier: (keyHash, callback) => {
                //debug('Target host key is automatically accepted: %b', keyHash);
                callback(true);
            }
        })
        .on('error', e => {
            const error = new Error(`Target host error: ${e}`);
            reject(error);
        })
        .on('ready', () => {
            debug('TARGET :: connection ready');
            resolve({target: sshDirect});
        });
    });
}