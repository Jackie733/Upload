#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const createZipArchive = require('./utils/compress');
const SSHClient = require('./utils/ssh');
const Config = require('./config');

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
      onProgress: (progress) => {
        const percentage = Math.floor(progress);
        const width = 30;
        const completed = Math.floor(width * (percentage / 100));
        const remaining = width - completed;
        const bar = '█'.repeat(completed) + '░'.repeat(remaining);

        process.stdout.write(`\x1b[K[${bar}] ${percentage}%\r`);

        if (percentage === 100) {
          process.stdout.write('\nUpload completed\n');
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
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `File "${filePath}" already exists.\n` +
        'Choose an option:\n' +
        '1) Overwrite\n' +
        '2) Resume (if supported)\n' +
        '3) Cancel\n' +
        'Your choice (1-3): ',
      (answer) => {
        rl.close();
        resolve(answer.trim());
      }
    );
  });
}

main().catch(console.error);
