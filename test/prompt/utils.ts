
import path from 'path';
import os from 'os';
//import { fileURLToPath } from 'url';

//export const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves paths that start with a tilde to the user's home directory.
 *
 * @param filePath '~/GitHub/Repo/file.png'
 * @return '/home/bob/GitHub/Repo/file.png'
 */
 export function resolvePath (filePath: string): string {
    if (!filePath || typeof(filePath) !== 'string') {
      return process.cwd();
    }
    // '~/folder/path' or '~' not '~alias/folder/path'
    if (filePath.startsWith('~/') || filePath === '~') {
      return filePath.replace('~', os.homedir());
    }
    return path.resolve(process.cwd(), filePath);
  }
