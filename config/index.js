import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class Config {
  static loadConfig() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const configPath = path.join(__dirname, 'config.json');
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (err) {
      console.error(`Load config error: ${err.message}`);
    }
    return { servers: {} };
  }

  static getServerConfig(serverName) {
    const config = this.loadConfig();
    return config.servers[serverName];
  }
}

export default Config;
