
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export class FileSocketServer {
    private netServer: net.Server;
    private _fileSocket?: string;
    constructor(connectionListener: (socket: net.Socket) => void) {
        this.netServer = net.createServer(connectionListener);
        process.on('cnyksEnd', () => {
            this.netServer.close();
        });
    }
    get fileSocket() {
        return this._fileSocket;
    }
    async start(): Promise<string> {
        const socketFile = await fileSocketPath();
        this._fileSocket = socketFile;
        this.netServer.listen(
            socketFile,
            //() => con.info('export SSH_AUTH_SOCK=%s', socketFile)
        );
        return socketFile;
    }
    stop(): Promise<void> {
        return new Promise<void>( (resolve, reject) => {
            this.netServer.close( (err: Error | undefined) => {
                if(err) return reject(err);
                return resolve();
            });
        });
    }
}

function fileSocketPath(): Promise<string>{
    return new Promise<string>((resolve, reject) => {
        const tempPath = path.join(os.tmpdir(), 'deploy-over-ssh');
        fs.mkdtemp(tempPath, (err, folder) => {
            if (err) return reject(err);
            const file_name = path.join(folder, crypto.randomBytes(16).toString('hex'));
            resolve(file_name);
            /*
            fs.writeFile(file_name, '', 'utf8', error_file => {
                if (error_file) return reject(error_file);
                fs.close()
                resolve(file_name);
            })
            */
        })
    })
}