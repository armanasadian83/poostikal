type SmsIrOtp={apiKey:string;templateId:number;parameterName:string;mobile:string;code:string};

export async function sendSmsIrOtp({apiKey,templateId,parameterName,mobile,code}:SmsIrOtp):Promise<void> {
  const failure='SMS.ir verification request failed.';
  try {
    const response=await fetch('https://api.sms.ir/v1/send/verify',{
      method:'POST',
      redirect:'error',
      signal:AbortSignal.timeout(15000),
      headers:{'x-api-key':apiKey,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({mobile,templateId,parameters:[{name:parameterName,value:code}]}),
    });
    if(!response.ok){await response.body?.cancel();throw new Error(failure);}
    const result:unknown=await response.json();
    if(!result||typeof result!=='object'||!('status' in result)||result.status!==1)throw new Error(failure);
  } catch {
    throw new Error(failure);
  }
}
