import {AdminCustomerDetails} from '@/components/admin/admin-customer-details';

export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  return <AdminCustomerDetails key={id} id={id}/>;
}
