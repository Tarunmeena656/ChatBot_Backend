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
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-chat',
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT ?? '',
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST ?? '',
  },
};
