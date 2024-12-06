#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('ssh2');

const loadConfig = () => {
  const configPath = path.join(process.env.HOME, 'code/toolkit/config.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    console.error(`Load config error: ${err.message}`);
  }
  return { servers: {} };
};

const SERVER_NAME = process.argv[2];
const LOCAL_FILE = process.argv[3];
const REMOTE_DIR = process.argv[4] || '~/uploads/';

if (!SERVER_NAME || !LOCAL_FILE) {
  console.error('Usage: ssh-upload <server> <local-file> [remote-dir]');
  console.error('Available servers:');
  const config = loadConfig();
  Object.keys(config.servers).forEach((name) => {
    console.log(`- ${name}`);
  });
  process.exit(1);
}

if (!fs.existsSync(LOCAL_FILE)) {
  console.error(`Error: file "${LOCAL_FILE}" not found`);
  process.exit(1);
}

const config = loadConfig();
const serverConfig = config.servers[SERVER_NAME];

if (!serverConfig) {
  console.error(`Error: server "${SERVER_NAME}" not found`);
  process.exit(1);
}

const SERVER_CONFIG = {
  host: serverConfig.host || process.env.SSH_HOST,
  port: serverConfig.port || process.env.SSH_PORT || 22,
  username: serverConfig.username || process.env.SSH_USER,
  password: serverConfig.password || process.env.SSH_PASSWORD,
  // privateKey: fs.readFileSync(process.env.SSH_KEY_PATH),
};

const REMOTE_PATH = path.join(REMOTE_DIR, path.basename(LOCAL_FILE));
const FILE_SIZE = fs.statSync(LOCAL_FILE).size;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const confirmOverwrite = async (filePath) => {
  return new Promise((resolve) => {
    rl.question(
      `Remote file "${filePath}" already exists\n1) overwrite\n2) resume\n3) cancel\nPlease select: `,
      (answer) => {
        resolve(answer.trim());
      }
    );
  });
};

const client = new Client();

client.on('ready', () => {
  console.log('connect to server success');

  client.sftp((err, sftp) => {
    if (err) {
      console.error(`SFTP error: ${err.message}`);
      client.end();
      return;
    }

    const createRemoteDirectory = async () => {
      const dirs = REMOTE_DIR.split('/').filter(Boolean);
      let currentPath = '/';

      for (const dir of dirs) {
        currentPath = path.posix.join(currentPath, dir);
        try {
          await new Promise((resolve, reject) => {
            sftp.stat(currentPath, (err, stats) => {
              if (err) {
                if (err.code === 2) {
                  sftp.mkdir(currentPath, (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                } else {
                  reject(err);
                }
              } else {
                if (stats.isDirectory()) {
                  resolve();
                } else {
                  reject(new Error(`${currentPath} is not a directory`));
                }
              }
            });
          });
        } catch (err) {
          console.error(`Create remote directory error: ${err.message}`);
          client.end();
          return;
        }
      }
      return true;
    };

    const startUpload = async () => {
      let startPosition = 0;

      try {
        const stats = await new Promise((resolve, reject) => {
          sftp.stat(REMOTE_PATH, (err, stats) => {
            if (err) {
              if (err.code === 2) {
                resolve(null);
              } else {
                reject(err);
              }
            } else {
              resolve(stats);
            }
          });
        });

        if (stats) {
          const answer = await confirmOverwrite(REMOTE_PATH);

          switch (answer) {
            case '1':
              startPosition = 0;
              break;
            case '2':
              startPosition = stats.size;
              console.log(`Resume uploading from position ${startPosition}`);
              break;
            case '3':
            default:
              console.log('Upload canceled');
              rl.close();
              client.end();
              return;
          }
          console.log(`Upload "${LOCAL_FILE}" to "${REMOTE_PATH}"...`);

          const readStream = fs.createReadStream(LOCAL_FILE, {
            start: startPosition,
          });
          const writeStream = sftp.createWriteStream(REMOTE_PATH, {
            flags: startPosition === 0 ? 'w' : 'a',
          });

          let uploadedBytes = startPosition;

          readStream.on('data', (chunk) => {
            uploadedBytes += chunk.length;
            const progress = ((uploadedBytes / FILE_SIZE) * 100).toFixed(2);
            process.stdout.write(
              `upload progress: ${progress}% (${uploadedBytes}/${FILE_SIZE} bytes)\r`
            );
          });

          writeStream.on('error', (err) => {
            console.error(`Upload error: ${err.message}`);
            rl.close();
            client.end();
          });

          writeStream.on('close', () => {
            console.log('\nUpload finished');
            rl.close();
            client.end();
          });

          readStream.pipe(writeStream);
        }
      } catch (err) {
        console.error(`Check remote file error: ${err.message}`);
        rl.close();
        return false;
      }
    };

    createRemoteDirectory()
      .then((success) => {
        if (!success) return;
        startUpload();
      })
      .catch((err) => {
        console.error(`Operate error：${err.message}`);
        rl.close();
        client.end();
      });
  });
});

client.on('error', (err) => {
  console.error(`Error connection: ${err.message}`);
  process.exit(1);
});

client.connect(SERVER_CONFIG);
