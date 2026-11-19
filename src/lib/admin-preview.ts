import type { AdminProduct, AdminProductStatus, AdminCategory, AdminBrand } from "./admin-product-model";
export type { AdminProduct, AdminProductStatus, AdminProductImage, AdminProductAttribute, AdminProductVariant, AdminAnimationConfig, AdminAnimationDimensions, AdminAnimationReference, AdminAnimationSlot, AdminAnimationTemplate, AdminMediaType, AdminCategory, AdminBrand, AdminMutationResult } from './admin-product-model';
export { getCategoryLabel } from './admin-product-model';

/** Shared admin records; initial collections are empty until the API responds. */
export const adminPreviewDate = new Date().toISOString().slice(0,10);
export const adminPreviewNotice = "مدیریت فروشگاه";

export type AdminOrderStatus = 'pending' | 'delivered' | 'cancelled';
export type AdminUserStatus = 'active' | 'blocked';
export type AdminUserRole = 'customer' | 'admin';

export interface AdminOrderItem {
  variantId: string;
  productId: string;
  name: string;
  brand: string;
  image: string;
  variantLabel: string;
  quantity: number;
  unitPriceToman: number;
}

export interface AdminOrder {
  version: number;
  id: string;
  number?: string;
  recipient?: import('./orders').OrderRecipient;
  shipping?: import('./orders').ShippingMethod;
  paymentStatus?: 'unpaid'|'rejected'|'paid';
  discountToman?: number;
  userId: string;
  userName: string;
  createdAt: string;
  dateLabel: string;
  status: AdminOrderStatus;
  items: AdminOrderItem[];
  subtotalToman: number;
  shippingToman: number;
  totalToman: number;
  note: string;
}

export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  city: string;
  joinedAt: string;
  joinedLabel: string;
  status: AdminUserStatus;
  role: AdminUserRole;
  orderCount: number;
  totalSpentToman: number;
}

export type AdminAccount = { id:string; name:string; email:string; role:'owner'|'admin'; active:boolean; version:number; createdAt?:string };

export type AdminProductListItem = Pick<AdminProduct,'id'|'name'|'slug'|'brand'|'brandId'|'category'|'categoryIds'|'stock'|'status'|'priceToman'|'regularPriceToman'|'discountPriceToman'|'image'> & {
  imageAlt:string; variants:Pick<AdminProduct['variants'][number],'id'|'label'|'stock'|'priceToman'>[];
};
export interface AdminPreviewData {
  currentAdmin: AdminAccount | null;
  products: AdminProductListItem[];
  categories: AdminCategory[];
  brands: AdminBrand[];
  orders: AdminOrder[];
  users: AdminUser[];
}

export const productStatusLabels: Record<AdminProductStatus, string> = {
  active: 'فعال',
  draft: 'پیش‌نویس',
  'out-of-stock': 'ناموجود',
};

export const orderStatusLabels: Record<AdminOrderStatus, string> = {
  pending: 'در حال بررسی',
  delivered: 'تکمیل شده',
  cancelled: 'لغو شده',
};

export const userStatusLabels: Record<AdminUserStatus, string> = {
  active: 'فعال',
  blocked: 'غیرفعال',
};

export const userRoleLabels: Record<AdminUserRole, string> = {
  customer: 'مشتری',
  admin: 'مدیر',
};



export function deriveAdminUserMetrics(users: AdminUser[], orders: AdminOrder[]): AdminUser[] {
  const totals=new Map<string,{orderCount:number;totalSpentToman:number}>();
  for(const order of orders){
    const total=totals.get(order.userId)??{orderCount:0,totalSpentToman:0};
    total.orderCount++;if(order.status==='delivered')total.totalSpentToman+=order.totalToman;
    totals.set(order.userId,total);
  }
  return users.map(user=>({...user,...(totals.get(user.id)??{orderCount:0,totalSpentToman:0})}));
}

export function createAdminPreview(): AdminPreviewData { return { currentAdmin: null, products: [], categories: [], brands: [], orders: [], users: [] }; }
