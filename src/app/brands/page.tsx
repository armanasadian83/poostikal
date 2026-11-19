import { CatalogLanding, listingMetadata, type ListingProps } from '@/components/catalog-landing';
import '../brands.css';

export const generateMetadata = (props: ListingProps) => listingMetadata('brands', props);

export default function Page(props: ListingProps) {
  return <CatalogLanding mode="brands" {...props}/>;
}
