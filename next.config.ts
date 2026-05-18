import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb', // upload de PDFs
    },
  },
  // pdf-parse usa fs/path; lo dejamos como external en el server bundle
  serverExternalPackages: ['pdf-parse'],
};

export default config;
