// utils/ssh.js
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

class SSHClient {
  constructor(config) {
    this.config = config;
    this.client = new Client();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.client
        .on('ready', () => {
          console.log(`Connected to server [${this.config.host}]`);
          resolve();
        })
        .on('error', reject)
        .connect(this.config);
    });
  }

  async getSftp() {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });
  }

  async uploadFile(localPath, remotePath, options = {}) {
    const sftp = await this.getSftp();
    return this._upload(sftp, localPath, remotePath, options);
  }

  async checkRemoteFile(remotePath) {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      sftp.stat(remotePath, (err, stats) => {
        console.log(`Checking remote file: ${remotePath}`);
        if (err && err.code === 2) {
          resolve(null);
        } else if (err) {
          reject(err);
        } else {
          resolve(stats);
        }
      });
    });
  }

  async _upload(sftp, localPath, remotePath, { onProgress, onOverwrite }) {
    try {
      const stats = await this.checkRemoteFile(remotePath);
      let startPosition = 0;
      let uploadedBytes = 0;

      if (stats) {
        const next = await onOverwrite?.(remotePath);
        if (next === 3) {
          throw new Error('Upload cancelled');
        }
        startPosition = next === '1' ? 0 : stats?.size || 0;
      }

      console.log('Uploading file...');

      // Create streams
      const readStream = fs.createReadStream(localPath, {
        start: startPosition,
      });
      const writeStream = sftp.createWriteStream(remotePath, {
        flags: startPosition === 0 ? 'w' : 'a',
      });

      const fileSize = fs.statSync(localPath).size;
      uploadedBytes = startPosition;

      return new Promise((resolve, reject) => {
        const cleanup = () => {
          readStream.destroy();
          writeStream.end();
        };

        readStream.on('error', (err) => {
          cleanup();
          reject(new Error(`Read error: ${err.message}`));
        });

        writeStream.on('error', (err) => {
          cleanup();
          reject(new Error(`Write error: ${err.message}`));
        });

        readStream.on('data', (chunk) => {
          uploadedBytes += chunk.length;
          const progress = Math.floor((uploadedBytes / fileSize) * 100);
          onProgress?.(progress);
        });

        writeStream.on('close', () => {
          cleanup();
          resolve();
        });

        writeStream.on('ready', () => {
          readStream.pipe(writeStream);
        });
      });
    } catch (err) {
      throw new Error(`Upload failed: ${err.message}`);
    }
  }

  disconnect() {
    this.client.end();
  }
}

module.exports = SSHClient;
