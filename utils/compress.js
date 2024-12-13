import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import util from 'node:util';
import { exec, spawn } from 'node:child_process';

const execAsync = util.promisify(exec);

const COMPRESSED_EXTENSIONS = [
  '.zip',
  '.rar',
  '.7z',
  '.gz',
  '.tar.gz',
  '.tgz',
  '.bz2',
  '.xz',
  '.tar',
];

// Compress using zip
const createZipArchive = async (sourcePath, compressDirOnly = true) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('Invalid source path');
  }

  const stats = fs.statSync(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();

  if (
    !stats.isDirectory() &&
    (compressDirOnly || COMPRESSED_EXTENSIONS.includes(ext))
  ) {
    return {
      path: sourcePath,
      cleanup: () => {},
    };
  }

  const tmpDir = os.tmpdir();
  const timestamp = new Date()
    .toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/[\/:]/g, '-') // Replace slashes and colons with hyphens
    .replace(/,|\s/g, '_') // Replace commas and spaces with underscore
    .replace(/\./g, '');
  const zipName = `${path.basename(sourcePath)}_${timestamp}.zip`;
  const zipPath = path.join(tmpDir, zipName);

  if (fs.existsSync(zipPath)) {
    await fs.promises.unlink(zipPath);
  }

  try {
    await execAsync('which zip');
  } catch (err) {
    throw new Error('zip command not found');
  }

  return new Promise((resolve, reject) => {
    console.log(`Compressing directory "${sourcePath}"...`);

    const zip = spawn('zip', ['-r', zipPath, path.basename(sourcePath)], {
      cwd: path.dirname(sourcePath),
    });

    zip.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    zip.stderr.on('data', (data) => {
      process.stdout.write(`\rProgress: ${data}`);
    });

    zip.on('error', (err) => {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
      reject(new Error(`Compression failed: ${err.message}`));
    });

    zip.on('close', (code) => {
      if (code !== 0) {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        reject(new Error(`Compression failed with code ${code}`));
        return;
      }

      if (!fs.existsSync(zipPath)) {
        reject(new Error('Compression failed: output file not found'));
        return;
      }

      const cleanup = () => {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
      };

      process.on('exit', cleanup);
      ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
        process.on(signal, () => {
          cleanup();
          process.exit();
        });
      });

      resolve({
        path: zipPath,
        cleanup,
      });
    });
  });
};

export { createZipArchive };
