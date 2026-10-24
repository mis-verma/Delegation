const os = require('node:os');
const path = require('node:path');

const siteRoot = path.join(os.homedir(), 'htdocs', 'api.karyaos.in');

module.exports = {
  apps: [
    {
      name: 'karya-server',
      script: 'dist/server.js',
      cwd: siteRoot,
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      kill_timeout: 30000,
      out_file: path.join(os.homedir(), 'logs', 'karya-server-out.log'),
      error_file: path.join(os.homedir(), 'logs', 'karya-server-error.log'),
      time: true,
    },
  ],
};
