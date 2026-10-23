import dotenv from 'dotenv';

dotenv.config({ quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: required('DATABASE_URL'),
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-chat',
    // path to a service account json file. not needed when FIRESTORE_EMULATOR_HOST is set
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT ?? '',
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST ?? '',
  },
};
