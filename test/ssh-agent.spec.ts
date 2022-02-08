import { SSHAgentDeamon } from '@/ssh-agent';

describe('embedded ssh-agent', () => {
    it('start and stop ssh-agent', async () => {
        const sshAgent = new SSHAgentDeamon();
        await sshAgent.start()
        sshAgent.stop();
    });
});