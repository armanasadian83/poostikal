import {Database} from '../dist/database.js';
if(process.argv.includes('--restore-target')){if(!process.env.RESTORE_DATABASE_URL)throw new Error('Set RESTORE_DATABASE_URL first');process.env.DATABASE_URL=process.env.RESTORE_DATABASE_URL;}
const db=new Database();try{await db.onModuleInit();console.log('Database migrations applied.');}finally{await db.onModuleDestroy();}
