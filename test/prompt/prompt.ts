import YAML from 'js-yaml';
import fs from 'fs';
import os from 'os';
import colors from 'colors';
import inquirer from 'inquirer';
import hostValidator from 'is-valid-hostname';
import deepmerge from 'deepmerge';

import { resolvePath } from './utils';
import { MyAboutSSH, MyAnswers, PromptAnswers } from '.';

const DEFAULT_PRIVATE_KEY = '~/.ssh/id_rsa';

/**
 * 
 * @param projectAboutSSH
 * @returns 
 */
export async function doPrompt(
            projectAboutSSH: MyAboutSSH
        ): Promise<MyAboutSSH> { 
    let myPreviousAnswers : MyAboutSSH | undefined = undefined;
    if(projectAboutSSH.personalConfig) try{
        myPreviousAnswers = YAML.load(fs.readFileSync(projectAboutSSH.personalConfig, 'utf8')) as MyAboutSSH;
    // eslint-disable-next-line no-empty
    } catch (e) {}
    //const savedAnswers: AboutSSH = { ...myAnswers, ...projectAboutSSH };
    //savedAnswers.bastion = { ...myAnswers.bastion, ...projectAboutSSH.bastion };
    //savedAnswers.target = { ...myAnswers.target, ...projectAboutSSH.target };
    const savedAnswers = myPreviousAnswers ? deepmerge( myPreviousAnswers, projectAboutSSH): projectAboutSSH ;
    console.log(colors.blue('Hi, give some data how to connect to target host'));
    const answers: PromptAnswers = await inquirer.prompt(getQuestionare(savedAnswers, projectAboutSSH));
    if(answers.iAmSober == 'reset'){
        if(projectAboutSSH.personalConfig){
            try{
                fs.writeFileSync(projectAboutSSH.personalConfig, ''); 
            }catch(e){
                throw new Error('Resetting personal input failed: file write error');
            }
        }
        throw new Error('Personal input is reset');
    }
    const aboutSSH = getAboutSSH(answers, savedAnswers);
    return aboutSSH;
}


/**
 * 
 * @param savedAnswers 
 * @returns questionare
 */
function getQuestionare(savedAnswers: MyAboutSSH, projectAboutSSH: MyAboutSSH): inquirer.QuestionCollection<PromptAnswers>{
    const qAnswers: inquirer.DistinctQuestion<PromptAnswers>[] = [
        //...getTargetHostQuestionare(savedAnswers, projectAboutSSH),
        //...getBastionHostQuestionare(savedAnswers, projectAboutSSH),
        {
            name: 'webRoot',
            message: 'Web root directory on the target host:',
            type: 'input',
            default: (): string | undefined => savedAnswers.webRoot,
            when: () : boolean => {
                return !process.env.DEPLOY_WEB_ROOT
            },
            validate: (dirname: string): boolean | string => {
                if(!dirname || dirname.length === 0) return 'Empty directory name';
                return true;
            }
        }
    ];

    if(Array.isArray(projectAboutSSH.webDir)){
        qAnswers.push({
            name: 'webDir',
            message: 'Upload directory in "web root directory":',
            type: 'list',
            //default: (): string | undefined => savedAnswers.webRoot,
            when: () : boolean => {
                return !process.env.DEPLOY_WEB_ROOT
            },
            validate: (dirname: string): boolean | string => {
                if(!dirname || dirname.length === 0) return 'Empty directory name';
                return true;
            },
            choices: projectAboutSSH.webDir
        });
    } else {
        qAnswers.push({
            name: 'webDir',
            message: 'Upload directory in "web root directory":',
            type: 'input',
            default: (): string | undefined => '.',
            when: () : boolean => {
                return !process.env.DEPLOY_WEB_ROOT
            },
            validate: (dirname: string, answers: PromptAnswers): boolean | string => {
                if(!answers.webRoot) return 'webRoot is undefiend';
                if(!dirname || dirname.length === 0) return 'Empty directory name';
                return true;
            }
        });        
    }

    qAnswers.push({
        name: 'iAmSober',
        message: 'Type "deploy" to proceed or "reset" to clear the input:',
        type: 'input',
        validate: (soberTest: string): boolean | string => {
            if(!soberTest || soberTest.length === 0) return 'deploy - to proceed, reset - to clear the input';
            if(soberTest !== 'deploy' && soberTest !== 'reset'){
                return `Type either "reset" or "deploy", you've typed: ${soberTest}`;
            }
            return true;
        }
    });
    return [
        ...getTargetHostQuestionare(savedAnswers, projectAboutSSH),
        ...getBastionHostQuestionare(savedAnswers, projectAboutSSH),
        ...qAnswers
    ];
}

function getBastionHostQuestionare(previousAboutSSH: MyAboutSSH, projectAboutSSH: MyAboutSSH): inquirer.DistinctQuestion<MyAnswers>[]{
    let bastionHostnameChanged = false;
    const porjectBastionHost = projectAboutSSH.bastion?.host;
    if(porjectBastionHost){
        console.log(colors.green('Bastion host: '), colors.cyan(`${porjectBastionHost.hostname}:${porjectBastionHost.port}`));
    }
    return [
        {
            name: 'needBastion',
            message: 'Connect through a bastion/jump host :',
            type: 'confirm',
            default: false,
            when: () => {
                return !previousAboutSSH.bastion?.host;
            }
        },
        {
            name: 'bastionHost',
            message: ' - bastion host (hostname:port) :',
            default: (): string | undefined =>  {
                if(previousAboutSSH.bastion?.host){
                    const { hostname, port } = previousAboutSSH.bastion.host;
                    if(hostname && port){
                        return `${hostname}:${port}`;
                    }
                }
            },
            when: (answers: MyAnswers): boolean => {
                answers.needBastion = answers.needBastion || !!previousAboutSSH.bastion?.host
                return answers.needBastion && !porjectBastionHost;
            },
            validate: (bastionHost: string, answers: MyAnswers): boolean | string => {
                const arr = bastionHost.split(':');
                const hostname = arr[0].trim();
                if(!hostValidator(hostname)){
                    answers.needBastion = false;
                    return true;
                }
                const lastBastionHost = previousAboutSSH.bastion?.host;
                const lastBastionHostString = lastBastionHost ? `${lastBastionHost.hostname}:${lastBastionHost.port}` : undefined;
                if(bastionHost != lastBastionHostString){
                    bastionHostnameChanged = true;
                }
                if(arr.length>1){
                    const portNum = parseInt(arr[1]);
                    if(isNaN(portNum)) return 'port is not a number';
                    if (portNum < 1) return 'Port should be greater than 0';
                    if (portNum > 65535 ) return 'Port should be less than 65536';
                }
                return true;
            }
        },
        {
            name: 'bastionUsername',
            message: ' - bastion username',
            default: (): string | undefined => {
                if(process.env.BASTION_USER) return process.env.BASTION_USER;
                if(!bastionHostnameChanged && previousAboutSSH.bastion?.username){
                    return previousAboutSSH.bastion.username;
                }
                try{
                    return os.userInfo().username;
                } catch(e){
                    return undefined;
                }
            },
            when: (answers: MyAnswers): boolean => {
                return (!!answers.needBastion && bastionHostnameChanged) || (!!previousAboutSSH.bastion?.host && !previousAboutSSH.bastion?.username && !process.env.BASTION_USER);
            },
            validate: (username: string): boolean | string => {
                if(!username || username.length === 0) return 'Empty username';
                return true;
            }
            
        },
        {
            name: 'bastionKey',
            message: ' - bastion private key file:',
            when: (answers: MyAnswers) : boolean => {
                return (!!answers.needBastion && bastionHostnameChanged) || (!!previousAboutSSH.bastion?.host && !previousAboutSSH.bastion?.privateKey && !process.env.BASTION_KEY_FILE);
            },
            default: (): string | undefined =>  {
                if(process.env.BASTION_KEY_FILE) return resolvePath(process.env.BASTION_KEY_FILE);
                if(previousAboutSSH.bastion?.privateKey){
                    return resolvePath(previousAboutSSH.bastion.privateKey);
                }
                if(fs.lstatSync(resolvePath(DEFAULT_PRIVATE_KEY)).isFile()){
                    return resolvePath(DEFAULT_PRIVATE_KEY);
                }
            },
            validate: (keyFile: string): boolean | string => {
                try{
                    const keyFilePath = resolvePath(keyFile);
                    const isFile = fs.lstatSync(keyFilePath).isFile();
                    if(isFile){
                        return true;
                    }
                    return `file not found - ${keyFilePath}`;
                } catch(e){ return `${e}`}
            },
        },   
    ];
}

function getTargetHostQuestionare(previousAboutSSH: MyAboutSSH,  projectAboutSSH: MyAboutSSH): inquirer.DistinctQuestion<MyAnswers>[]{
    let targetHostnameChanged = false;
    const projectTargetHost = projectAboutSSH.target?.host;
    if(projectTargetHost){
        console.log(colors.green('Target host: '), colors.cyan(`${projectTargetHost.hostname}:${projectTargetHost.port}`));
    }
    
    return [
        {
            name: 'targetHost',
            message: 'Target host (hostname:port) :',
            default: (): string | undefined =>  {
                if(previousAboutSSH.target?.host){
                    const { hostname, port } = previousAboutSSH.target.host;
                    if(hostname && port){
                        return `${hostname}:${port}`;
                    }
                }
            },
            validate: (targetHost: string): boolean | string => {
                const arr = targetHost.split(':');
                const hostname = arr[0].trim();
                if(!hostValidator(hostname)){
                    return 'invalid hostname';
                }
                const lastTargetHost = previousAboutSSH.target?.host;
                const lastTargetHostString = lastTargetHost ? `${lastTargetHost.hostname}:${lastTargetHost.port}` : undefined;
                if(targetHost != lastTargetHostString){
                    targetHostnameChanged = true;
                }
                if(arr.length>1){
                    const portNum = parseInt(arr[1]);
                    if(isNaN(portNum)) return 'port is not a number';
                    if (portNum < 1) return 'Port should be greater than 0';
                    if (portNum > 65535 ) return 'Port should be less than 65536';
                }
                return true;
            },
            when: () => !projectTargetHost
        },
        {
            name: 'targetUsername',
            message: ' - target username',
            default: (): string | undefined => {
                if(process.env.TARGET_USER) return process.env.TARGET_USER;
                if(!targetHostnameChanged && previousAboutSSH.target?.username){
                    return previousAboutSSH.target.username;
                }
                try{
                    return os.userInfo().username;
                } catch(e){
                    return undefined;
                }
            },
            when: () => targetHostnameChanged || !previousAboutSSH.target?.username,
            validate: (username: string): boolean | string => {
                if(!username || username.length === 0) return 'Empty username';
                return true;
            }
        },
        {
            name: 'targetKey',
            message: ' - target private key file :',
            when: () : boolean => {
                return targetHostnameChanged || !previousAboutSSH.target?.privateKey;
            },
            default: (): string | undefined =>  {
                if(process.env.TARGET_KEY_FILE) return resolvePath(process.env.TARGET_KEY_FILE);
                if(previousAboutSSH.target?.privateKey){
                    return resolvePath(previousAboutSSH.target.privateKey);
                }
                if(fs.lstatSync(resolvePath(DEFAULT_PRIVATE_KEY)).isFile()){
                    return resolvePath(DEFAULT_PRIVATE_KEY);
                }
            },
            validate: (keyFile: string): boolean | string => {
                try{
                    const keyFilePath = resolvePath(keyFile);
                    const isFile = fs.lstatSync(keyFilePath).isFile();
                    if(isFile){
                        return true;
                    }
                    return `file not found - ${keyFilePath}`;
                } catch(e){ return `${e}`}
            }
        },   
    ];
}


function getAboutSSH(answers: PromptAnswers, previousAbout: MyAboutSSH): MyAboutSSH {
    const aboutSSH = {} as MyAboutSSH;
    //// target host ///
    let _targetPort, _targetHostname;
    if(answers.targetHost){
      const arr = answers.targetHost.split(':');
      _targetHostname = arr[0];
      _targetPort = arr.length>1 ? parseInt(arr[1]) : 22;
    } else if (previousAbout.target?.host){
      _targetHostname = previousAbout.target.host.hostname;
      _targetPort = previousAbout.target.host.port;
    }
    if(!_targetHostname || !_targetPort) return aboutSSH;

    const _targetUsername = answers.targetUsername || previousAbout.target?.username;
    const _targetPrivateKey = answers.targetKey || previousAbout.target?.privateKey;
    aboutSSH.target = {
      host: { hostname: _targetHostname, port: _targetPort },
      username: _targetUsername,
      privateKey: _targetPrivateKey
    };
    /// bastion host ///
    let _bastionHostname, _bastionPort;
    if(answers.bastionHost){
      const arr = answers.bastionHost.split(':');
      _bastionHostname = arr[0];
      _bastionPort = arr.length>1 ? parseInt(arr[1]) : 22;
    } else if (previousAbout.bastion?.host){
      _bastionHostname = previousAbout.bastion.host.hostname;
      _bastionPort = previousAbout.bastion.host.port;
    }
    if(_bastionHostname && _bastionPort){
        const _bastionUsername = answers.bastionUsername || previousAbout.bastion?.username;
        const _bastionPrivateKey = answers.bastionKey || previousAbout.bastion?.privateKey;
        aboutSSH.bastion = {
            host: {hostname: _bastionHostname, port: _bastionPort},
            username: _bastionUsername,
            privateKey: _bastionPrivateKey,
        }
    }
    aboutSSH.webRoot = answers.webRoot;
    aboutSSH.webDir = answers.webDir;
    return aboutSSH;
  }