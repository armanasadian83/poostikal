import {resolve} from 'node:path';
import {restore} from './snapshot.mjs';
const folder=process.argv[2];
if(!folder||!process.env.RESTORE_DATABASE_URL||!process.env.RESTORE_MEDIA_DIR)throw new Error('Pass a backup folder and set RESTORE_DATABASE_URL and RESTORE_MEDIA_DIR for an empty migrated destination.');
if(process.env.RESTORE_DATABASE_URL===process.env.DATABASE_URL)throw new Error('Restoring over the active database is not allowed.');
await restore(process.env.RESTORE_DATABASE_URL,resolve(folder),resolve(process.env.RESTORE_MEDIA_DIR));console.log('Restore completed. Sessions were not restored; sign in again.');
