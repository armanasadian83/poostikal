import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type SupplierCredentials={consumerKey:string;consumerSecret:string};
type Sealed={iv:string;tag:string;data:string};
export const canStoreSupplierCredentials=()=>/^[a-f0-9]{64}$/i.test(process.env.SUPPLIER_ENCRYPTION_KEY??'');
function key(){
  if(!canStoreSupplierCredentials())throw new Error('کلید رمزگذاری اتصال روی سرور تنظیم نشده است.');
  return Buffer.from(process.env.SUPPLIER_ENCRYPTION_KEY!,'hex');
}
export function sealSupplierCredentials(value:SupplierCredentials):Sealed {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from('poostikal:raboteb:v1'));
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function openSupplierCredentials(value:Sealed):SupplierCredentials {
  try{
    const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(value.iv,'base64'));
    decipher.setAAD(Buffer.from('poostikal:raboteb:v1'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8'));
  }catch{throw new Error('اتصال ذخیره‌شده قابل خواندن نیست؛ کلید رمزگذاری سرور را بررسی کن.');}
}
