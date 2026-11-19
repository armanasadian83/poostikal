'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { adminPreviewDate, orderStatusLabels, type AdminOrder } from '@/lib/admin-preview';
import { formatNumber, formatPrice } from '@/lib/format';
import { normalizeSearch } from '@/lib/search';
import { useAdmin } from './admin-provider';
import { AdminPageHeading, AdminPanel, AdminBadge, AdminEmpty } from './admin-ui';
import { AdminIcon, type AdminIconName } from './admin-icon';

function SalesChart({ orders, days }: { orders: AdminOrder[]; days: number }) {
  const gradientId=useId();
  const base=Date.parse(`${adminPreviewDate}T00:00:00Z`);
  const bins=days===7?7:6;
  const interval=days===7?1:5;
  const series=Array.from({length:bins},(_,index)=>{
    const start=base-(days-1-index*interval)*86400000;
    const end=start+interval*86400000;
    const value=orders.filter(order=>order.status!=='cancelled'&&order.status!=='pending'&&Date.parse(order.createdAt)>=start&&Date.parse(order.createdAt)<end).reduce((sum,order)=>sum+order.totalToman,0);
    return {value,label:new Intl.DateTimeFormat('fa-IR',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(start))};
  });
  const max=Math.max(1000000,...series.map(point=>point.value))*1.15;
  const points=series.map((point,index)=>({x:55+index*560/(bins-1),y:165-point.value/max*125}));
  const line=points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ');
  return <div className="admin-chart"><svg viewBox="0 0 640 210" role="img" aria-label={`روند فروش در ${formatNumber(days)} روز؛ ${series.map(item=>`${item.label}: ${formatPrice(item.value)} تومان`).join('، ')}`}><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--tone-1228)" stopOpacity=".35"/><stop offset="1" stopColor="var(--tone-1229)" stopOpacity=".03"/></linearGradient></defs>{[0,1,2,3,4].map(tick=><g key={tick}><path d={`M 55 ${165-tick*31.25} H 615`} stroke="var(--tone-1230)" strokeWidth="1"/><text x="41" y={169-tick*31.25} textAnchor="end" fontSize="10" fill="var(--tone-1231)">{formatNumber(Math.round(max*tick/4/1000000))}</text></g>)}{points.map((point,index)=><path key={index} d={`M ${point.x} 40 V 165`} stroke="var(--theme-on-primary)" strokeWidth="1"/>)}<path d={`${line} L 615 165 L 55 165 Z`} fill={`url(#${gradientId})`}/><path d={line} fill="none" stroke="var(--tone-1232)" strokeWidth="2.8" strokeLinejoin="round"/>{points.map((point,index)=><g key={index}><circle cx={point.x} cy={point.y} r="4" fill="var(--tone-1233)" stroke="var(--theme-on-primary)" strokeWidth="2"/><text x={point.x} y="192" textAnchor="middle" fill="var(--tone-1234)" fontSize="10">{series[index].label}</text></g>)}</svg><span className="admin-chart-unit">میلیون تومان</span></div>;
}
export function AdminDashboard() {
  const {products,orders,users,settings,categories}=useAdmin();
  const [days,setDays]=useState(7);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const base=Date.parse(`${adminPreviewDate}T00:00:00Z`);
  const periodOrders=orders.filter(order=>Date.parse(order.createdAt)>=base-(days-1)*86400000);
  const paid=periodOrders.filter(order=>order.status!=='cancelled'&&order.status!=='pending');
  const sales=paid.reduce((sum,order)=>sum+order.totalToman,0);
  const groups=[...categories.slice(0,4).map((category,index)=>({id:category.id,label:category.name,color:['var(--tone-1235)','var(--tone-1236)','var(--tone-1237)','var(--tone-1238)'][index],value:0})),{id:'',label:'سایر محصولات',color:'var(--tone-1239)',value:0}];
  const index=new Map(products.map(p=>[p.id.replace(/^raboteb-/,'catalog-'),p]));
  const soldById=new Map<string,number>();
  for(const order of paid)for(const item of order.items){
    const id=item.productId.replace(/^raboteb-/,'catalog-'),p=index.get(id);
    const group=groups.find(g=>g.id===p?.category)??groups[groups.length-1];
    group.value+=item.unitPriceToman*item.quantity;
    if(p)soldById.set(p.id,(soldById.get(p.id)??0)+item.quantity);
  }
  const groupTotal=groups.reduce((sum,item)=>sum+item.value,0);
  let degree=0;
  const donut=groups.map(item=>{const start=degree;degree+=groupTotal?item.value/groupTotal*360:0;return `${item.color} ${start}deg ${degree}deg`;}).join(',');
  const recent=orders.filter(order=>(status==='all'||order.status===status)&&normalizeSearch(`${order.number} ${order.userName}`).includes(normalizeSearch(query))).slice(0,5);
  const best=products.map(product=>({...product,sold:soldById.get(product.id)??0})).sort((a,b)=>b.sold-a.sold).slice(0,4);
  const stats:{label:string;value:number;icon:AdminIconName;note:string;unit?:string}[]=[
    {label:'محصولات',value:products.length,icon:'products',note:`${formatNumber(products.filter(item=>item.status==='active').length)} محصول فعال`},
    {label:'کاربران',value:users.length,icon:'users',note:`${formatNumber(users.filter(item=>item.status==='active').length)} حساب فعال`},
    {label:'سفارش‌ها',value:periodOrders.length,icon:'orders',note:`${formatNumber(periodOrders.filter(item=>item.status==='pending').length)} در انتظار بررسی`},
    {label:'فروش',value:sales,icon:'trend',unit:'تومان',note:`در ${formatNumber(days)} روز انتخاب‌شده`},
  ];
  return <><AdminPageHeading title={`سلام، به ${settings.storeName} خوش اومدی`} action={<label className="admin-date-filter"><AdminIcon name="calendar" size={18}/><select aria-label="بازه گزارش" value={days} onChange={event=>setDays(Number(event.target.value))}><option value={7}>۷ روز گذشته</option><option value={30}>۳۰ روز گذشته</option></select></label>}/><div className="admin-kpi-grid">{stats.map(stat=><section className="admin-glass admin-kpi" key={stat.label}><div><h2>{stat.label}</h2><span className="admin-kpi-icon"><AdminIcon name={stat.icon} size={24}/></span></div><strong>{formatPrice(stat.value)} {stat.unit?<small>{stat.unit}</small>:null}</strong><p>{stat.note}</p></section>)}</div>
    <div className="admin-chart-grid"><AdminPanel title="روند فروش" action={<div className="admin-segmented" role="group" aria-label="بازه نمودار"><button aria-pressed={days===7} onClick={()=>setDays(7)}>۷ روز</button><button aria-pressed={days===30} onClick={()=>setDays(30)}>۳۰ روز</button></div>}><SalesChart orders={orders} days={days}/></AdminPanel><AdminPanel title="دسته‌بندی فروش" className="admin-category-panel"><div className="admin-donut-content"><div className="admin-donut" style={{background:groupTotal?`conic-gradient(${donut})`:'var(--tone-1240)'}} role="img" aria-label={groups.map(item=>`${item.label}: ${formatNumber(Math.round(item.value/(groupTotal||1)*100))} درصد`).join('، ')}><div><strong>{formatNumber(Math.round(groupTotal/1000000))}</strong><span>میلیون تومان</span></div></div><div className="admin-chart-legend">{groups.map(item=><div key={item.label}><i style={{background:item.color}}/><span>{item.label}</span><strong>{formatNumber(Math.round(item.value/(groupTotal||1)*100))}٪</strong></div>)}</div></div></AdminPanel></div>
    <AdminPanel title="سفارش‌های اخیر" className="admin-dashboard-orders" action={<div className="admin-recent-controls"><label className="admin-search-field"><AdminIcon name="search" size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="جستجو در سفارش‌ها..." aria-label="جستجو در سفارش‌های اخیر"/></label><select className="admin-field" aria-label="وضعیت سفارش‌های اخیر" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">همه وضعیت‌ها</option>{Object.entries(orderStatusLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><Link className="admin-text-link" href="/admin/orders">همه سفارش‌ها<AdminIcon name="arrow-left" size={16}/></Link></div>}><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>شماره سفارش</th><th>مشتری</th><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th><th><span className="sr-only">جزئیات</span></th></tr></thead><tbody>{recent.map(order=><tr key={order.number}><td><span dir="ltr" className="admin-order-id">#{order.number}</span></td><td>{order.userName}</td><td className="admin-money">{formatPrice(order.totalToman)} <small>تومان</small></td><td><AdminBadge status={order.status}/></td><td className="admin-small">{order.dateLabel}</td><td><Link className="admin-table-action" href={`/admin/orders/${order.number??order.number}`}><AdminIcon name="more" size={19}/></Link></td></tr>)}</tbody></table></div>{!recent.length?<AdminEmpty/>:null}</AdminPanel>
    <AdminPanel title="محصولات پرفروش" action={<Link className="admin-text-link" href="/admin/products">همه محصولات<AdminIcon name="arrow-left" size={16}/></Link>}><div className="admin-best-products">{best.map(product=><Link key={product.id} href="/admin/products"><div className="admin-product-thumb"><Image src={product.image} alt="" fill sizes="48px"/></div><div><strong>{product.name}</strong><small>{formatNumber(product.sold)} عدد در سفارش‌ها</small></div></Link>)}</div></AdminPanel>
    
    </>;
}
