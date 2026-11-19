export type ShippingMethod = { id:string; name:string; description:string; type:'flat'|'collect'; feeToman:number; active:boolean; sortOrder:number };
export type OrderRecipient = { name:string; phone:string; province:string; city:string; address:string; postalCode:string; note:string };
export type CheckoutItem = { productId:string; variantId:string; quantity:number; expectedUnitPriceToman:number };
export type OrderReceipt = { id:string; number:string; status:string; createdAt:string; items:{productId:string;variantId:string;name:string;variantLabel:string;quantity:number;unitPriceToman:number;image:string}[]; subtotalToman:number; discountToman:number; shipping:ShippingMethod; shippingToman:number; totalToman:number };
export const normalizeDigits = (value:string) => value.replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632));
