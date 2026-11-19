import { AdminOrderEditor } from '@/components/admin/admin-order-editor';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AdminOrderEditor orderId={id}/>;}
