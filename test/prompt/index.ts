import { doPrompt } from './prompt';
import { connect, SSHConnected, AboutSSH } from '../../src';
import yargs from 'yargs';
import YAML from 'js-yaml';
import fs from 'fs';
import path from 'path';
import colors from 'colors';
import { debug as d } from 'debug';
import deepmerge from 'deepmerge';
import { diff } from 'deep-object-diff';
import inquirer from 'inquirer';

const debug = d('prompt');

export interface MyAboutSSH extends Partial<AboutSSH> {
    webRoot?: string,
    /**
     * Directory or directories (then user has to select) to update, relative to webRoot
     */
    webDir?: string | string[],
    archiveRoot?: string
}


export interface MyAnswers extends inquirer.Answers {
    needBastion?: boolean,
    bastionHost?: string,
    bastionUsername?: string,
    bastionKey?: string,
    targetHost: string,
    targetUsername: string,
    targetKey: string,
}
export interface PromptAnswers extends Partial<MyAnswers> {
    webRoot?: string,
    /**
     * Directory or directories (then user has to select) to update, relative to webRoot
     */
    webDir?: string,
    archiveRoot?: string,
    iAmSober: 'deploy' | 'reset'
}

const argsParser = yargs(process.argv.slice(2))
.options({
    configFile: {
        description: 'Configuration file',
        demandOption: true,
        type: 'string',
        alias: 'c',
        
    }
    //a: {type: 'boolean', default: false },
    //b: { type: 'string', demandOption: true },
    //c: { type: 'number', alias: 'chill' },
    //d: { type: 'array' },
    //e: { type: 'count' },
    //f: { choices: ['1', '2', '3'] }
});
(async () => {
    const argv = await argsParser.argv;
    const configFile = argv.configFile;
    try{
        const configFilePath = path.resolve(configFile);
        const projectAboutSSH = YAML.load(fs.readFileSync(configFilePath, 'utf8')) as MyAboutSSH;
        let myPreviousAnswers : MyAboutSSH = {};
        if(projectAboutSSH.personalConfig){
            const configDir = path.dirname(configFilePath);
            const personalConfigRelative = path.resolve(configDir, projectAboutSSH.personalConfig);
            debug('Personal config', personalConfigRelative);
            projectAboutSSH.personalConfig = personalConfigRelative;
            myPreviousAnswers = YAML.load(fs.readFileSync(projectAboutSSH.personalConfig, 'utf8')) as MyAboutSSH;
        }
        const savedAnswers = deepmerge( myPreviousAnswers, projectAboutSSH);
        const aboutSSH = await doPrompt(savedAnswers);
        debug('connect with', aboutSSH);
        if(!aboutSSH.webRoot) throw new Error('webRoot is undefiend');
        const sshConnected: SSHConnected = await connect(aboutSSH);
        if(projectAboutSSH.personalConfig){
            const myAboutSSH = diff(projectAboutSSH, aboutSSH);
            debug('project config', projectAboutSSH);
            debug('my config', myAboutSSH);
            const yaml = YAML.dump(myAboutSSH);
            debug('my yaml', yaml);
            fs.writeFileSync(projectAboutSSH.personalConfig, yaml);
        }
        const webRoot = aboutSSH.webRoot;
        sshConnected.target.sftp((err, sftp) => {
                if (err) throw err;
                sftp.readdir(webRoot, (err, list) => {
                    if (err) throw err;
                    debug(list);
                    sshConnected.target.end();
                    //sshConnected.bastion?.end();
                });
            });
    } catch(e){
        debug(colors.red( ((e as Error).message || e) as string) );
        process.exit(1);
    }
})();

