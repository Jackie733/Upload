import fs from 'node:fs/promises';
import { Client } from 'ssh2';
import SpeedTracker from './speed.js';

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

  /**
   *
   * @param {import('ssh2').SFTPWrapper} sftp
   * @param {string} localPath
   * @param {string} remotePath
   * @param {*} param3
   * @returns
   */
  async _upload(sftp, localPath, remotePath, { onProgress, onOverwrite }) {
    try {
      const fileHandle = await fs.open(localPath, 'r');
      const fileSize = (await fileHandle.stat()).size;

      const stats = await this.checkRemoteFile(remotePath);
      let startPosition = 0;
      let uploadedBytes = 0;

      if (stats && typeof onOverwrite === 'function') {
        const next = await onOverwrite(remotePath);
        if (next === '3') {
          throw new Error('Upload cancelled');
        }
        startPosition = next === '1' ? 0 : stats?.size || 0;
      }

      console.log('Uploading file...');
      const speedTracker = new SpeedTracker();

      return new Promise((resolve, reject) => {
        uploadedBytes = startPosition;

        const readStream = fileHandle.createReadStream({
          start: startPosition,
        });
        const writeStream = sftp.createWriteStream(remotePath, {
          flags: startPosition === 0 ? 'w' : 'a',
        });

        readStream.pipe(writeStream);

        const cleanup = () => {
          readStream.destroy();
          writeStream.end();
        };

        readStream.on('data', (chunk) => {
          uploadedBytes += chunk.length;
          if (typeof onProgress === 'function') {
            const speed = speedTracker.calculateSpeed(uploadedBytes);
            const progress = Math.floor((uploadedBytes / fileSize) * 100);
            onProgress(progress, progress !== 100 ? speed : undefined);
          }
        });

        readStream.on('error', (err) => {
          cleanup();
          reject(new Error(`Read error: ${err.message}`));
        });

        writeStream.on('error', (err) => {
          cleanup();
          reject(new Error(`Write error: ${err.message}`));
        });

        writeStream.on('close', async () => {
          cleanup();
          resolve();
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

export default SSHClient;
