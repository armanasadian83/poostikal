import { AdminProductEditor } from '@/components/admin/admin-product-editor';
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminProductEditor productId={id}/>;
}
