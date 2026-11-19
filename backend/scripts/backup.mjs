import {resolve} from 'node:path';
import {snapshot} from './snapshot.mjs';
const folder=resolve('../backups',new Date().toISOString().replaceAll(':','-'));await snapshot(process.env.DATABASE_URL,folder,resolve(process.env.MEDIA_DIR||'../.data/media'));console.log(`Backup saved: ${folder}`);
