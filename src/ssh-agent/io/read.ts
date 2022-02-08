import net from 'net';

interface Offsetable {
  payloadOffset: number;
}

export class OffsetableBuffer {
  private _offset: number;
  private constructor(private readonly source: Buffer){
    const sourceUnknown = source as unknown;
    const sourceOffsetable = sourceUnknown as Offsetable;
    this._offset = sourceOffsetable.payloadOffset ?? 0;
  }
  static from(buffer: Buffer): OffsetableBuffer{
    return new OffsetableBuffer(buffer);
  }
  getSource(): Buffer {
    return this.source;
  }
  /**
   * 
   * @param lengh if we already know the length of a string, e.g. from nextLength()
   * @returns 
   */
  nextString(length?: number): Buffer {
    const recordSize = length || this.source.readUInt32BE(this.payloadOffset);
    const sourceStart = this._offset+=4;
    const sourceEnd = this._offset+=recordSize;
    const record = Buffer.alloc(recordSize);
    this.source.copy(record, 0, sourceStart, sourceEnd);
    return record;
  }
  nextType(): number {
    const result = this.source.readUInt8(this._offset);
    this._offset ++;
    return result;
  }
  nextLength(): number {
    const result = this.source.readUInt32BE(this._offset);
    this._offset += 4;
    return result;
  }

  get payloadOffset(): number {
    return this._offset;
  }
}


/**
 * read once in a stream, return the contents as a buffer
 */
export function readSocket(socket: net.Socket): Promise<Buffer | undefined> {

  //if(socket.then) return stream.then(read);

  return new Promise((resolve, reject) => {

    //if stream as already been drained (or is closed), returns a void buffer
    //const isReadable = socket.readable;
    const readLength = socket.readableLength;
    const isDestroyed = socket.destroyed;
    if(isDestroyed && !readLength)
      resolve(undefined);

    if(socket.isPaused())
      resolve(socket.read());


    const onData = (result: Buffer) => { cleanup(); resolve(result); };
    const onEnd = () => { cleanup(); resolve(undefined); };
    const onError = (err: Error) => { cleanup(); reject(err); };

    socket.once('data', onData);
    socket.once('end', onEnd);
    socket.once('error', onError);

    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
    };
    return socket;
  });
}