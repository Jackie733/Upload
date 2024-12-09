import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import util from 'node:util';
import { exec } from 'node:child_process';

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
const createZipArchive = async (sourcePath, compressDirOnly = false) => {
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
  const timestamp = new Date().getTime();
  const zipName = `${path.basename(sourcePath)}-${timestamp}.zip`;
  const zipPath = path.join(tmpDir, zipName);

  if (fs.existsSync(zipPath)) {
    await fs.promises.unlink(zipPath);
  }

  try {
    await execAsync('which zip');
  } catch (err) {
    throw new Error('zip command not found');
  }

  try {
    console.log(`Compressing directory "${sourcePath}"...`);
    const { stderr } = await execAsync(
      `cd "${path.dirname(sourcePath)}" && zip -r "${zipPath}" "${path.basename(
        sourcePath
      )}"`
    );

    if (stderr) {
      throw new Error(`Zip error: ${stderr}`);
    }

    if (!fs.existsSync(zipPath)) {
      throw new Error(`Compression failed`);
    }

    process.on('exit', () => {
      if (fs.existsSync(zipPath)) {
        try {
          fs.unlinkSync(zipPath);
        } catch (err) {
          console.error(`Delete tmp file error: ${err.message}`);
        }
      }
    });

    // handle error
    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
      process.on(signal, () => {
        if (fs.existsSync(zipPath)) {
          try {
            fs.unlinkSync(zipPath);
          } catch (err) {
            console.error(`Delete tmp file error: ${err.message}`);
          }
        }
        process.exit();
      });
    });

    return {
      path: zipPath,
      cleanup: () => {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
      },
    };
  } catch (err) {
    if (fs.existsSync(zipPath)) {
      await fs.promises.unlink(zipPath);
    }
    throw new Error(`Compress error: ${err.message}`);
  }
};

export { createZipArchive };
