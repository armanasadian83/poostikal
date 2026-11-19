import {readFile,appendFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

const path=new URL('../.env',import.meta.url);
const text=await readFile(path,'utf8');
const match=text.match(/^SUPPLIER_ENCRYPTION_KEY=(.*)$/m);
if(match?.[1].trim()){
  if(!/^[a-f0-9]{64}$/i.test(match[1].trim()))throw new Error('Existing SUPPLIER_ENCRYPTION_KEY is invalid; it has not been replaced.');
  console.log('Supplier encryption key already configured.');
}else{
  const line=`SUPPLIER_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`;
  if(match)await writeFile(path,text.replace(/^SUPPLIER_ENCRYPTION_KEY=.*$/m,line));
  else await appendFile(path,`\n${line}\n`);
  console.log('Supplier encryption key created privately in backend/.env. Restart the API to use it.');
}
