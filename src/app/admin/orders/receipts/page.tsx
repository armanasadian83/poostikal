import {AdminPaymentReceipts} from '@/components/admin/admin-payment-receipts';
export default async function ReceiptQueue({searchParams}:{searchParams:Promise<{order?:string}>}){
  const {order}=await searchParams;
  return <AdminPaymentReceipts initialNumber={typeof order==='string'&&/^\d{6}$/.test(order)?order:''}/>;
}
