/**
 * Firebase web client config for Allmoxy / Opticut Station.
 * Public by design — security is enforced by Firestore rules.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDQx7n_kd6C3wei3TkD5oFMTZXsTezGb8o',
  authDomain: 'allmoxy-10366.firebaseapp.com',
  projectId: 'allmoxy-10366',
  storageBucket: 'allmoxy-10366.firebasestorage.app',
  messagingSenderId: '815228582463',
  appId: '1:815228582463:web:f2ddec4813591c4398d68a',
  measurementId: 'G-CBHPYFTF9X',
};

/** Firestore collection of sent station cut lists (one doc per batch key). */
export const STATION_JOBS_COLLECTION = 'stationJobs';
