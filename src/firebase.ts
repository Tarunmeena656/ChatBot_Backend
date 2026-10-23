import { readFileSync } from 'node:fs';
import { AppOptions, applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from './config';

function options(): AppOptions {
  const { projectId, emulatorHost, serviceAccount } = config.firebase;
  if (emulatorHost) {
    return { projectId };
  }
  if (serviceAccount) {
    return { projectId, credential: cert(JSON.parse(readFileSync(serviceAccount, 'utf8'))) };
  }
  return { projectId, credential: applicationDefault() };
}

export const firestore = getFirestore(initializeApp(options()));
