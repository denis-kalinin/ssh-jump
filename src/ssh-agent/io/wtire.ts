import { SSH_AGENT_PROTOCOL } from './protocol';

/**
 * Adds `data`'s length to `data`
 * @param data
 * @param payloadType 
 * @returns `data.length`+`data`
 */
export function addSizePrefix(data: Buffer | number ): Buffer {
    let body;
    if(!Buffer.isBuffer(data)) {
        body = Buffer.alloc(4);
        body.writeUInt32BE(data);
        body = body.slice(-Math.ceil(Math.log1p(data) /Math.log(256)) ); //trim leading zeros
    } else {
        body = data;
    }
    const bodySize = Buffer.alloc(4);
    bodySize.writeUInt32BE(body.length, 0);
    return Buffer.concat([bodySize, body]);
}

export function addType(data: SSH_AGENT_PROTOCOL) : Buffer {
    return Buffer.from([data]);
}

export function addNumber(data: number): Buffer {
    const body = Buffer.alloc(4);
    body.writeUInt32BE(data);
    return body;
}