import type { PoolClient } from 'pg';
import type { SourceProduct } from './raboteb-mapping.js';
import type { ProductDocument } from './validation.js';

// The database uses this same projection when releasing orders from stock.
export async function applySupplierInventory(client:PoolClient, product:ProductDocument, source:SourceProduct) {
  const {published,inStock,stock,type}=source;
  const variants=source.variants.map(({id,inStock,stock,stockFromParent})=>({id,inStock,stock,stockFromParent}));
  const {rows}=await client.query('SELECT supplier_available_inventory($1,$2,$3,NULL) AS state',[
    product.id,JSON.stringify(product.variants),{published,inStock,stock,type,variants},
  ]);
  Object.assign(product,rows[0].state);
}
