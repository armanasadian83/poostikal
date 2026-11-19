import type { OrderReceipt,OrderRecipient } from './orders';

export type ReceiptStatus='pending'|'approved'|'rejected'|'cancelled';
export const receiptLabels:Record<ReceiptStatus,string>={pending:'در حال بررسی',approved:'تأیید شده',rejected:'رد شده',cancelled:'لغو شده'};
export type BankCard={cardNumber:string;holderName:string};
export type PaymentReceipt={id:string;status:ReceiptStatus;rejectionReason:string|null;amountToman:number;uploadedAt:string;expiresAt:string};
export type ReceiptRow=PaymentReceipt&{orderNumber:string;orderTotalToman:number;customerName:string;orderStatus:string;hasImage:boolean};
export type PaymentConfirmation={order:OrderReceipt;recipient?:OrderRecipient;bank:BankCard|null;receipt:PaymentReceipt|null;paymentStatus:'paid'|'rejected'|'unpaid'};

export async function prepareReceipt(file:File):Promise<Blob> {
  if(file.size>10*1024*1024)throw new Error('حجم تصویر از ۱۰ مگابایت بیشتر است. تصویر کوچک‌تری انتخاب کن.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('لطفاً تصویر فیش را با فرمت JPG، PNG یا WebP انتخاب کن.');
  if(file.size<2_000_000)return file;
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;
    try{await image.decode();}catch{throw new Error('تصویر خوانده نشد. عکس دیگری انتخاب کن.');}
    if(image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('ابعاد تصویر خیلی بزرگ است. تصویر کوچک‌تری انتخاب کن.');
    const canvas=document.createElement('canvas');
    for(const [edge,quality] of [[2800,.91],[2400,.84],[2000,.78],[1600,.72],[1200,.65]]){
      const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');if(!ctx)break;
      ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.size<2_000_000)return blob;
    }
    throw new Error('کاهش حجم این تصویر ممکن نشد؛ عکس کوچک‌تری انتخاب کن.');
  }finally{URL.revokeObjectURL(url);}
}
