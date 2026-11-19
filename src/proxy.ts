import { NextRequest, NextResponse } from 'next/server';

// API queries independently enforce session validity and object ownership.
// Forward only the single opaque credential to the configured private API.
export async function proxy(request:NextRequest) {
  const pathname=request.nextUrl.pathname;
  const admin=pathname==='/admin'||pathname.startsWith('/admin/');
  if(pathname==='/admin')return NextResponse.next();
  const cookie=admin?'poostikal_admin':'poostikal_customer';
  const token=request.cookies.get(cookie)?.value;
  const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
  if(token && /^[A-Za-z0-9_-]{43}$/.test(token)){
    try{
      const result=await fetch(new URL(admin?'/api/admin/session':'/api/customer/session',process.env.API_INTERNAL_URL||'http://127.0.0.1:4000'),{
        headers:{Cookie:cookie+'='+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4000)
      });
      if(result.ok)return NextResponse.next({headers});
      if(result.status!==401 && result.status!==403)throw new Error();
    }catch{return new NextResponse('ارتباط با فروشگاه برقرار نشد. دوباره تلاش کن.',{status:503,headers:{...headers,'Retry-After':'5','Content-Type':'text/plain; charset=utf-8'}});}
  }
  const url=request.nextUrl.clone();
  url.pathname=admin?'/admin':'/login';url.search='';
  if(!admin && !pathname.startsWith('/myaccount'))url.searchParams.set('reason','shopping');
  return NextResponse.redirect(url,{status:307,headers});
}
export const config={matcher:['/admin/:path*','/myaccount/:path*','/cart','/checkout/:path*']};
