import type {AdminOrderStatus, AdminUserStatus} from './admin-preview';

export interface CustomerHistory {
  customer: {id:string; name:string; phone:string; email:string; city:string; status:AdminUserStatus; localTest:boolean;
    joinedAt:string|null; importedAt:string|null; lastLoginAt:string|null};
  stats: {orderCount:number; completedCount:number; pendingCount:number; cancelledCount:number; totalSpentToman:number;
    averageOrderToman:number; firstOrderAt:string|null; lastOrderAt:string|null};
  topProducts: {productId:string; name:string; image:string|null; quantity:number; orderCount:number; totalToman:number}[];
  orders: {page:number; pageSize:number; total:number; items:{id:string; number:string; createdAt:string; status:AdminOrderStatus;
    totalToman:number; paymentStatus:'paid'|'unpaid'|'rejected'; itemCount:number; recipientName:string; recipientPhone:string}[]};
  addresses: {id:string; label:string; name:string; phone:string; province:string; city:string; address:string; postalCode:string}[];
}
