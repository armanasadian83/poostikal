import {Agent,fetch,ProxyAgent,type Dispatcher} from 'undici';

const proxyUrl=process.env.RABOTEB_PROXY_URL;
const dispatcher=proxyUrl
  ? new ProxyAgent({uri:proxyUrl,connectTimeout:20000,requestTls:{timeout:20000},proxyTls:{timeout:20000}})
  : new Agent({connectTimeout:20000});

export class SupplierRequestError extends Error {
  constructor(message:string,readonly code:string,readonly retryable:boolean,readonly status?:number,readonly retryAfterMs?:number,public attempts=1){super(message);this.name='SupplierRequestError';}
}
export type SupplierRetry={attempt:number;maxAttempts:number;nextAttemptAt:string;message:string;code:string};

function errorCodes(error:unknown,depth=0):string[]{
  if(!error||typeof error!=='object'||depth>5)return [];
  const value=error as {code?:unknown;name?:unknown;cause?:unknown;errors?:unknown[]};
  return [typeof value.code==='string'?value.code:'',typeof value.name==='string'?value.name:'',...errorCodes(value.cause,depth+1),...(Array.isArray(value.errors)?value.errors.flatMap(item=>errorCodes(item,depth+1)):[])];
}

// Never persist raw network errors: they can contain request URLs or credentials.
export function supplierRequestError(error:unknown,usingProxy=!!proxyUrl):SupplierRequestError{
  if(error instanceof SupplierRequestError)return error;
  const codes=errorCodes(error);
  if(codes.some(code=>['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','SELF_SIGNED_CERT_IN_CHAIN'].includes(code)))return new SupplierRequestError('گواهی امنیتی ارتباط با مبدأ معتبر نیست؛ ساعت سیستم و اتصال امن را بررسی کن.','TLS_CERTIFICATE',false);
  if(codes.some(code=>['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','TimeoutError'].includes(code)))return new SupplierRequestError('مهلت ارتباط با مبدأ تمام شد. اتصال اینترنت یا پراکسی و پاسخ‌گویی رابوطب را بررسی کن.','CONNECTION_TIMEOUT',true);
  if(codes.includes('ECONNREFUSED'))return new SupplierRequestError(usingProxy?'اتصال رد شد؛ روشن بودن و دسترس‌پذیری پراکسی تنظیم‌شده روی سرور را بررسی کن.':'سرور مبدأ اتصال را نپذیرفت؛ ارتباط اینترنت و دسترس‌پذیری رابوطب را بررسی کن.','CONNECTION_REFUSED',true);
  if(codes.some(code=>['ENOTFOUND','EAI_AGAIN'].includes(code)))return new SupplierRequestError('نشانی سرور پیدا نشد؛ ارتباط اینترنت و تنظیمات DNS را بررسی کن.','DNS_LOOKUP',true);
  if(codes.some(code=>['ECONNRESET','EPIPE','UND_ERR_SOCKET'].includes(code)))return new SupplierRequestError('ارتباط هنگام دریافت اطلاعات قطع شد؛ دریافت دوباره تلاش می‌شود.','CONNECTION_RESET',true);
  return new SupplierRequestError('ارتباط با مبدأ برقرار نشد؛ اینترنت، پراکسی و دسترس‌پذیری رابوطب را بررسی کن.','NETWORK_ERROR',true);
}

type Options={headers?:Record<string,string>;limit?:number;onRetry?:(retry:SupplierRetry|null)=>Promise<void>;fetcher?:typeof fetch;sleep?:(ms:number)=>Promise<void>;dispatcher?:Dispatcher;usingProxy?:boolean};
export async function supplierRemote(url:URL,options:Options={}){
  const {headers={},limit=20*1024*1024,onRetry,fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}=options;
  const attempts=4;
  for(let attempt=1;attempt<=attempts;attempt++){
    let result:{buffer:Buffer;headers:Headers}|undefined;
    try{
      const response=await fetcher(url,{dispatcher:options.dispatcher??dispatcher,headers,redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!response.ok){
        await response.body?.cancel();
        const status=response.status;
        const retryHeader=response.headers.get('retry-after');
        const retryAfterMs=retryHeader?( /^\d+$/.test(retryHeader)?Number(retryHeader)*1000:Date.parse(retryHeader)-Date.now()):undefined;
        const message=status===401||status===403?'دسترسی به مبدأ رد شد؛ مجوز کلید ووکامرس و محدودیت‌های امنیتی رابوطب را بررسی کن.':status===429?'مبدأ تعداد درخواست‌ها را محدود کرده است؛ کمی بعد دوباره تلاش می‌شود.':`مبدأ پاسخ ${status} داد؛ سرویس رابوطب را بررسی کن.`;
        throw new SupplierRequestError(message,`HTTP_${status}`,[408,429,500,502,503,504].includes(status),status,Number.isFinite(retryAfterMs)?retryAfterMs:undefined);
      }
      if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new SupplierRequestError('حجم پاسخ مبدأ بیش از حد مجاز است.','RESPONSE_TOO_LARGE',false);}
      if(!response.body)throw new SupplierRequestError('پاسخ مبدأ خالی است.','EMPTY_RESPONSE',true);
      const chunks:Uint8Array[]=[];let length=0;
      for await(const chunk of response.body){length+=chunk.length;if(length>limit)throw new SupplierRequestError('حجم پاسخ مبدأ بیش از حد مجاز است.','RESPONSE_TOO_LARGE',false);chunks.push(chunk);}
      result={buffer:Buffer.concat(chunks),headers:response.headers as unknown as Headers};
    }catch(error){
      const failure=supplierRequestError(error,options.usingProxy??!!proxyUrl);failure.attempts=attempt;
      if(!failure.retryable||attempt===attempts)throw failure;
      const delay=Math.min(30000,Math.max(1000*2**(attempt-1),failure.retryAfterMs??0));
      await onRetry?.({attempt:attempt+1,maxAttempts:attempts,nextAttemptAt:new Date(Date.now()+delay).toISOString(),message:failure.message,code:failure.code});
      await sleep(delay);
      continue;
    }
    if(attempt>1)await onRetry?.(null);
    return result!;
  }
  throw new SupplierRequestError('ارتباط با مبدأ برقرار نشد.','NETWORK_ERROR',true);
}
