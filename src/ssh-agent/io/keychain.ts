import { EventEmitter } from 'events';
import crypto from 'crypto';
import RSA from 'node-rsa';
import { toPem } from './pem';

export interface PublicKeyInfo {
    public: Buffer,
    fingerprint: string,
    comment: string,
}

interface KeyInfo extends PublicKeyInfo {
    private: RSA,
    algo: 'rsa', 
}

export class KeyChain extends EventEmitter {
    private keyList: Record<string, KeyInfo> = {};
    constructor() {
        super();
        this.on('sign', (): void => {
            //con.log("In signing stuffs");
        });
    }

    add_key (body: RSA.Key, comment='') {
        if(Buffer.isBuffer(body)) body = toPem(body, 'RSA PRIVATE KEY');
        const key = new RSA(body, 'private', {signingScheme : 'pkcs1-sha1'});
        const details = key.exportKey('components');    
        const writeb = (data: Buffer | string | number) => {
            let body: Buffer;
            if(typeof data == 'string') body = Buffer.from(data);
            else if(typeof data == 'number') {
                body = Buffer.alloc(4);
                body.writeUInt32BE(data);
                body = body.slice(-Math.ceil(Math.log1p(data) /Math.log(256)) ); //trim leading zeros
            } else body = data;
            const size = Buffer.alloc(4);
            size.writeUInt32BE(body.length, 0);
            return Buffer.concat([size, body]);
        }
        //openssl public
        const publicKey = Buffer.concat([ writeb('ssh-rsa'), writeb(details.e), writeb(details.n) ]);
        
        const fingerprint = crypto.createHash('md5').update(publicKey).digest('hex');

        this.emit('add_key', {comment: comment} );
        const keyInfo: KeyInfo = {
            fingerprint,
            public: publicKey,
            private: key,
            comment,
            algo: 'rsa',
        }
        this.keyList[fingerprint] = keyInfo;
    }

    /**
     * 
     * @param fingerprint thumbpring or comment
     * @returns 
     */
    _lookup(fingerprint: string): KeyInfo | undefined {
        if(this.keyList[fingerprint]) return this.keyList[fingerprint];
        for(const fp in this.keyList){
            if(this.keyList[fp].comment == fingerprint) return this.keyList[fp];
        }
    }

    sign(fingerprint: string, message: RSA.Data): Buffer {
        const key = this._lookup(fingerprint);
        if(!key) throw `Failed to sign, invalid fingerprint/comment ${fingerprint}`;
        const sign = key.private.sign(message);
        this.emit('sign', {fingerprint: key.fingerprint, comment: key.comment});
        return sign;
    }

    remove_key(fingerprint: string) {
        const key = this._lookup(fingerprint);
        if(!key) throw `Invalid fingerprint/comment ${fingerprint}`;
        delete this.keyList[key.fingerprint];
    }

  remove_keys() {
    this.keyList = {};
  }

    get keys(): PublicKeyInfo[] {
        const keys: PublicKeyInfo[] = [];
        for(const fp in this.keyList){
            const keyInfo = this.keyList[fp];
            const publicKeyInfo: PublicKeyInfo = {
                fingerprint: keyInfo.fingerprint,
                public: keyInfo.public,
                comment: keyInfo.comment
            }
            keys.push(publicKeyInfo);
        }
        this.emit('list_keys');
        return keys;
    }

}