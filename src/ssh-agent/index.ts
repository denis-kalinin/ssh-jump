import net from 'net';
import crypto from 'crypto';
import asn1 from 'asn1';
import { KeyChain } from './io/keychain';
import { FileSocketServer } from './io/filesocket';
import { OffsetableBuffer } from './io/read';
import { SSH_AGENT_PROTOCOL } from './io/protocol';
import { addNumber, addSizePrefix, addType } from './io/wtire';
import { toBigIntBE, toBufferBE } from 'bigint-buffer';


export class SSHAgentDeamon {
    private readonly vault: KeyChain = new KeyChain();
    private socketServer!: FileSocketServer;
    private sshAgentServer!: SSHAgentServer;
    constructor() {
        this.sshAgentServer = new SSHAgentServer(this.vault);
        const SocketServerFactory = FileSocketServer;
        //if(os.platform() == 'win32') Factory = require('pageantbridge');
        this.socketServer = new SocketServerFactory(
            (socket) => { this.sshAgentServer.onClientConnect(socket); }
        );
    }
    get socket(): string | undefined {
        return this.socketServer.fileSocket;
    }
    start(): Promise<string> {
        return this.socketServer.start();
    }
    stop(): Promise<void> {
        this.sshAgentServer.stop();
        return this.socketServer.stop();
    }
}

class SSHAgentServer {
    private socket?: net.Socket;
    constructor(private vault: KeyChain) {}

    stop(){
        if(this.socket) {
            this.socket.removeAllListeners();
            this.socket.end();
        }
    }

    onClientConnect(socket: net.Socket) {
        this.socket = socket;
        let payload = Buffer.alloc(0);
        let payloadLength: number;

        const init = (buffer: Buffer): void => {
            if(buffer.length < 4) throw 'Invalid paylod';
            const oBuffer = OffsetableBuffer.from(buffer);
            payloadLength = oBuffer.nextLength();
            socket.on('data', feed);
            feed(oBuffer.getSource().slice(oBuffer.payloadOffset));
        };

        const feed = (buffer: Buffer): void => {
            payload = Buffer.concat([payload, buffer]);
            if(payload.length >= payloadLength) {
                this._parse(socket, payload);
                payload = Buffer.alloc(0);
                socket.removeListener('data', feed);
                socket.once('data', init);
            }
        };

        socket.once('data', init);
        //socket.once('error', () => );
        //socket.once('end', () => debug('No data anymore'));
    }

    /**
     * 
     * @param socket 
     * @param callback 
     * @returns empty result
     */
    list_keys_v1(socket: net.Socket, callback?: () => void) {
        const respondIdentities = (): Buffer => addSizePrefix(0);
        return this._respond(socket, SSH_AGENT_PROTOCOL.SSH_AGENT_RSA_IDENTITIES_ANSWER, respondIdentities, callback);
    }

    list_keys_v2(socket: net.Socket, callback?: () => void) {
        const respondIdentities = (): Buffer => {
            const out = [addNumber(this.vault.keys.length)];
            this.vault.keys.forEach((key) => {
                out.push(addSizePrefix(key.public));
                out.push(addSizePrefix(Buffer.from(key.comment)));
            });
            return Buffer.concat(out);
        };
        return this._respond(socket, SSH_AGENT_PROTOCOL.SSH2_AGENT_IDENTITIES_ANSWER, respondIdentities, callback);
    }

    sign(socket: net.Socket, oPayload: OffsetableBuffer, callback?: () => void) {
        const key_blob = oPayload.nextString();
        const message  = oPayload.nextString();
        const fingerprint = crypto.createHash('md5').update(key_blob).digest('hex');
        try {
            const sign = this.vault.sign(fingerprint, message);
            const respondSigning = (): Buffer => {
                const id = addSizePrefix(Buffer.from('ssh-rsa'));
                const signature = addSizePrefix(sign);
                return addSizePrefix( Buffer.concat([id, signature]) );
            };
            return this._respond(socket, SSH_AGENT_PROTOCOL.SSH2_AGENT_SIGN_RESPONSE, respondSigning, callback);
        } catch(err) {
            return this._respond(socket, SSH_AGENT_PROTOCOL.SSH_AGENT_FAILURE, null,  callback);
        }
    }

    add_key(socket: net.Socket, oPayload: OffsetableBuffer, callback?: () => void ) {
        const algo = oPayload.nextString().toString('ascii');
        const n = oPayload.nextString();
        const e = oPayload.nextString();
        const d = oPayload.nextString();
        const coeff = oPayload.nextString();
        const p = oPayload.nextString();
        const q = oPayload.nextString();
        const comment = oPayload.nextString();

        const p1 = toBigIntBE(p);
        const q1 = toBigIntBE(q);
        const dmp1 = toBigIntBE(d);
        const dmq1 = toBigIntBE(d);

        const dmp1_1 = toBufferBE( dmp1 % (p1 - 1n), 8);
        const dmq1_1 = toBufferBE( dmq1 % (q1 - 1n), 8);

        //const length = n.length + d.length + p.length + q.length + dmp1_1.length + dmq1_1.length + coeff.length + 512; // magic
        const writer = new asn1.BerWriter();
        //openssl private
        writer.startSequence();
        writer.writeInt(0);
        writer.writeBuffer(n, 2);
        writer.writeBuffer(e, 2);
        writer.writeBuffer(d, 2);
        writer.writeBuffer(p, 2);
        writer.writeBuffer(q, 2);
        writer.writeBuffer(dmp1_1, 2);
        writer.writeBuffer(dmq1_1, 2);
        writer.writeBuffer(coeff, 2);
        writer.endSequence();

        this.vault.add_key(writer.buffer);

        return this._respond(socket, SSH_AGENT_PROTOCOL.SSH_AGENT_SUCCESS, null, callback);
    }

    _respond(
                socket: net.Socket,
                type: SSH_AGENT_PROTOCOL,
                responseFn?: (() => Buffer) | null,
                callback?: ()=> void): void {
        const msg = [addType(type)];
        if(responseFn) msg.push(responseFn());
        const body =  addSizePrefix(Buffer.concat(msg));
        socket.write(body);
    }


    _parse(socket: net.Socket, payload: Buffer) {
        const oPayload = OffsetableBuffer.from(payload);
        const payloadType = oPayload.nextType();

        switch(payloadType) {
            case SSH_AGENT_PROTOCOL.SSH_AGENTC_REQUEST_RSA_IDENTITIES: {
                this.list_keys_v1(socket);
                break;
            }
            case SSH_AGENT_PROTOCOL.SSH2_AGENTC_REQUEST_IDENTITIES: {
                this.list_keys_v2(socket);
                break;
            }
            case SSH_AGENT_PROTOCOL.SSH2_AGENTC_ADD_IDENTITY: {
                this.add_key(socket, oPayload);
                break;
            }
            case SSH_AGENT_PROTOCOL.SSH2_AGENTC_SIGN_REQUEST: {
                this.sign(socket, oPayload);
                break;
            }
            default: {
                return;
            }
        }
    }
}
