// PM2 process manager config for running SIPlat on a VPS (e.g. Hostinger).
// Start:   pm2 start ecosystem.config.js
// Reload:  pm2 reload ecosystem.config.js --update-env
// Secrets/env are read from the .env file in this folder (Next.js loads it).
module.exports = {
  apps: [
    {
      name: "siplat",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: "3000" },
      max_memory_restart: "700M",
      autorestart: true,
    },
  ],
};
