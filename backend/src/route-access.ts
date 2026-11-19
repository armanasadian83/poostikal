import { CanActivate, ExecutionContext, ForbiddenException, Injectable, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Database } from './database.js';
import { AdminGuard, type AdminRequest } from './security.js';
import { requireCustomerSession } from './customer-session.js';

// Compare Nest route definitions, never raw URLs or client-supplied identity.
const publicGet=new Set(['api/support/:id/messages','api/health','api/storefront-revision','api/catalog','api/catalog/sitemap','api/products','api/products/:slug','api/media/:filename','api/theme','api/site-settings','api/shipping-methods']);
const publicPost=new Set(['api/support/:id/messages/:messageId/like','api/support/open','api/support/:id/messages','api/analyses','api/analyses/recommendations','api/auth/login','api/auth/logout','api/customer/otp','api/customer/verify','api/customer/logout','api/chat']);
const ownerWrites=new Set(['api/admin/sms','api/admin/integrations/openrouter','api/admin/ai','api/admin/raboteb/connection','api/admin/raboteb/enabled','api/admin/payment-bank']);
@Injectable()
export class RouteAccessGuard implements CanActivate {
  constructor(private readonly admin:AdminGuard,private readonly db:Database){}
  async canActivate(ctx:ExecutionContext){
    const handler=ctx.getHandler();
    const route=[Reflect.getMetadata(PATH_METADATA,ctx.getClass()),Reflect.getMetadata(PATH_METADATA,handler)].join('/').split('/').filter(Boolean).join('/');
    const method=Reflect.getMetadata(METHOD_METADATA,handler);
    const req=ctx.switchToHttp().getRequest<AdminRequest>();
    if(route==='api/admin'||route.startsWith('api/admin/')){
      await this.admin.canActivate(ctx);
      if(method!==RequestMethod.GET && ownerWrites.has(route) && req.adminRole!=='owner')throw new ForbiddenException('فقط سازنده سایت می‌تواند این تنظیمات را تغییر دهد.');
      return true;
    }
    if((method===RequestMethod.GET&&publicGet.has(route)) || (method===RequestMethod.POST&&publicPost.has(route)))return true;
    if(route.startsWith('api/customer/')||route==='api/orders'||route.startsWith('api/order-payment/')){
      await requireCustomerSession(this.db.pool,req);return true;
    }
    throw new ForbiddenException();
  }
}
