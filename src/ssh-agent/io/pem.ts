export function toPem(blob: string | Buffer, keyCommentType = 'RSA PRIVATE KEY'){
    let body: string;
    if(Buffer.isBuffer(blob))
        body = blob.toString('base64');
    else
        body = blob;
    let bodyLines: string[] = str_chunk(body, 64);
    const header = '-----BEGIN ' + keyCommentType + '-----';
    const footer = '-----END ' + keyCommentType + '-----';
    bodyLines = [ header, ...bodyLines, footer];
    return bodyLines.join('\n');
}

function str_chunk(str: string, chunkSize = 0): string[] {
    if(chunkSize <= 0)
      return [str];
  
    const chunks: string[] = [];
  
    while(str) {
      if(str.length < chunkSize) {
        chunks.push(str);
        break;
      } else {
        chunks.push(str.substring(0, chunkSize));
        str = str.substring(chunkSize);
      }
    }
    return chunks;
  }