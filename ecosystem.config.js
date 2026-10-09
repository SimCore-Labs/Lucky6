module.exports = {
  apps: [
    {
      name: 'lucky6-backend',
      script: 'npm',
      args: 'run start:prod --workspace=backend',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lucky6-engine',
      script: 'npm',
      args: 'run start:prod --workspace=engine',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lucky6-settlement',
      script: 'npm',
      args: 'run start:prod --workspace=settlement',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lucky6-payment-worker',
      script: 'npm',
      args: 'run start:prod --workspace=payment-worker',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
