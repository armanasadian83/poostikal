import { CatalogLanding, listingMetadata, type ListingProps } from '@/components/catalog-landing';

export const generateMetadata = (props: ListingProps) => listingMetadata('shop', props);

export default function Page(props: ListingProps) {
  return <CatalogLanding mode="shop" {...props}/>;
}
