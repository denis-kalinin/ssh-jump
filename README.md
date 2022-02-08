# Motivation

Sometimes the only way to deploy to production servers is SSH. And if your working environment is Nodjs, then you have some packages for SSH, but what if the SSH connection goes thrgough so called bastion (or jump) host?

`ssh-jump` can create SSH connection through bastion/jump host without setting ssh-agent in the operation system - it contains pure nodejs implementation of ssh-agent.