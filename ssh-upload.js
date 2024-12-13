#!/usr/bin/env node

import path from 'node:path';
import { select } from '@inquirer/prompts';
import { createZipArchive } from './utils/compress.js';
import SSHClient from './utils/ssh.js';
import Config from './config/index.js';

async function main() {
  const [serverName, localFile, remoteDir] = process.argv.slice(2);

  if (!serverName || !localFile) {
    showUsage();
    process.exit(1);
  }

  const serverConfig = Config.getServerConfig(serverName);
  if (!serverConfig) {
    console.error(`Error: server "${serverName}" not found`);
    process.exit(1);
  }

  let uploadFile = localFile;
  let cleanup = null;
  let sshClient = null;

  try {
    const result = await createZipArchive(localFile);
    uploadFile = result.path;
    cleanup = result.cleanup;

    sshClient = new SSHClient({
      host: serverConfig.host,
      port: serverConfig.port || 22,
      username: serverConfig.username,
      password: serverConfig.password,
    });

    await sshClient.connect().catch((err) => {
      throw new Error(`SSH connection error: ${err.message}`);
    });

    const remotePath = path.join(
      remoteDir || `/home/${serverConfig.username}/uploads/`,
      path.basename(uploadFile)
    );

    await sshClient.uploadFile(uploadFile, remotePath, {
      onProgress: (progress, speed) => {
        const percentage = Math.floor(progress);
        const width = 30;
        const completed = Math.floor(width * (percentage / 100));
        const remaining = width - completed;
        const bar = '█'.repeat(completed) + '░'.repeat(remaining);
        const speedDisplay = speed ? ` - ${speed}` : '';

        process.stdout.write(`\x1b[K[${bar}] ${percentage}%${speedDisplay}\r`);

        if (percentage === 100) {
          process.stdout.write('\nUpload completed\r');
          process.stdout.write('\nFile remote path: ' + remotePath + '\n');
        }
      },
      onOverwrite: async (path) => {
        const answer = await confirmOverwrite(path);
        return answer;
      },
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  } finally {
    if (sshClient) {
      sshClient.disconnect();
    }
    if (cleanup) {
      cleanup();
    }
  }
}

function showUsage() {
  console.error(
    'Usage: ssh-upload <server> <local-file | local-directory> [remote-dir]'
  );
  console.log('Available servers:');
  const config = Config.loadConfig();
  Object.keys(config.servers).forEach((name) => console.log(`- ${name}`));
}

function confirmOverwrite(filePath) {
  return select({
    message: `File "${filePath}" already exists`,
    choices: [
      { name: 'Overwrite', value: '1' },
      { name: 'Resume (if supported)', value: '2' },
      { name: 'Cancel', value: '3' },
    ],
  });
}

main().catch(console.error);
