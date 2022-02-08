import net from 'net';
import crypto from 'crypto';
import NodeRSA from 'node-rsa';
import { addSizePrefix, addType } from './io/wtire';
import { SSH_AGENT_PROTOCOL } from './io/protocol';
import { OffsetableBuffer, readSocket } from './io/read';

export class SSHAgentClient {

    private socket!: net.Socket;
    constructor(private fileSocket: string) {
        this.socket = net.connect(fileSocket);
    }

  async _request(request: string, messageType: SSH_AGENT_PROTOCOL, payload: Buffer) {
    try {
        this.socket.write(payload);
        const data: Buffer | undefined = await readSocket(this.socket);
        if(!data) throw new Error('socket is closed');
        const oPayload = OffsetableBuffer.from(data);
        const len = oPayload.nextLength();
        if(len !== data.length - 4)
            throw new Error(`Expected length: ${len} but got: ${data.length}`);

        const type = oPayload.nextType();
        if(type !== messageType)
            throw new Error(`Expected message type: ${messageType} but got: ${type}`);

        return data;
    } catch(err) {
      throw new Error(`Failure in ${request}`);
    }

  }


  async add_key(rawKeyFromFile: Buffer, comment?: string) {
    const rsa = new NodeRSA(rawKeyFromFile);
    const key = rsa.exportKey('components');
    const algo = 'ssh-rsa';

    const publicKey = Buffer.concat([addSizePrefix(Buffer.from(algo)), addSizePrefix(key.e), addSizePrefix(key.n)]);
    //const fingerprint = md5(publicKey);     //openssl public
    const fingerprint = crypto.createHash('md5').update(publicKey).digest('hex')
    const packet = addSizePrefix(Buffer.concat([
      addType(SSH_AGENT_PROTOCOL.SSH2_AGENTC_ADD_IDENTITY),
      addSizePrefix(Buffer.from(algo)),
      addSizePrefix(key.n),
      addSizePrefix(key.e),
      addSizePrefix(key.d),
      addSizePrefix(key.coeff),
      addSizePrefix(key.p),
      addSizePrefix(key.q),
      addSizePrefix(Buffer.from(comment || '')),
    ]));

    return this._request(`add_key ${fingerprint}`, SSH_AGENT_PROTOCOL.SSH_AGENT_SUCCESS, packet);
  }
}

