module.exports = {
  // Keep the frontend on Vercel; EC2 runs only the API and backend workers.
  apps: [
    {
      name: 'lucky6-backend',
      cwd: __dirname,
      script: 'backend/dist/main.js',
      node_args: '--env-file=backend/.env',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lucky6-engine',
      cwd: __dirname,
      script: 'engine/dist/main.js',
      node_args: '--env-file=backend/.env',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lucky6-settlement',
      cwd: __dirname,
      script: 'settlement/dist/main.js',
      node_args: '--env-file=backend/.env',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lucky6-payment-worker',
      cwd: __dirname,
      script: 'payment-worker/dist/main.js',
      node_args: '--env-file=backend/.env',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
