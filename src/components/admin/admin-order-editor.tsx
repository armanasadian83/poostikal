'use client';
import Image from 'next/image';
import Link from 'next/link';
import {useEffect,useState,type FormEvent} from 'react';
import {api} from '@/lib/api';
import {orderStatusLabels,type AdminOrder,type AdminOrderItem,type AdminOrderStatus} from '@/lib/admin-preview';
import {type OrderRecipient,type ShippingMethod,normalizeDigits} from '@/lib/orders';
import {formatPrice} from '@/lib/format';
import {normalizeSearch} from '@/lib/search';
import {useAdmin} from './admin-provider';
import {AdminIcon} from './admin-icon';
import {AdminBadge,AdminModal,AdminPageHeading,AdminPanel} from './admin-ui';
export function AdminOrderEditor({orderId}:{orderId:string}){
 const [order,setOrder]=useState<AdminOrder|null>(null),[methods,setMethods]=useState<ShippingMethod[]>([]),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();Promise.all([api<AdminOrder>('/admin/orders/'+encodeURIComponent(orderId),{signal:c.signal}),api<ShippingMethod[]>('/admin/shipping-methods',{signal:c.signal})]).then(([o,m])=>{setOrder(o);setMethods(m);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[orderId]);
 if(error)return <AdminPanel><p role="alert" className="admin-form-error">{error}</p><Link href="/admin/orders" className="admin-button">بازگشت به سفارشات</Link></AdminPanel>;
 if(!order)return <AdminPanel>در حال دریافت سفارش…</AdminPanel>;
 return <OrderForm key={order.id+'-'+order.version} order={order} methods={methods} onSaved={setOrder}/>;
}
function OrderForm({order,methods,onSaved}:{order:AdminOrder;methods:ShippingMethod[];onSaved:(o:AdminOrder)=>void}){
 const {products,notify,refreshOrders}=useAdmin();
 const [recipient,setRecipient]=useState<OrderRecipient>(order.recipient??{name:order.userName,phone:'',province:'',city:'',address:'',postalCode:'',note:order.note??''});
 const [items,setItems]=useState<AdminOrderItem[]>(order.items),[shippingId,setShippingId]=useState(order.shipping?.id??''),[fee,setFee]=useState(order.shippingToman),[status,setStatus]=useState(order.status);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[picker,setPicker]=useState(false),[query,setQuery]=useState(''),[confirm,setConfirm]=useState(false),[choices,setChoices]=useState<Record<string,string>>({});
 const locked=order.status==='delivered',shipping=methods.find(m=>m.id===shippingId),shippingFee=shipping?.type==='collect'?0:fee,subtotal=items.reduce((s,i)=>s+i.quantity*i.unitPriceToman,0);
 function validate(){
  if(recipient.name.trim().length<2)return 'نام کامل گیرنده را وارد کن.';
  if(!/^09\d{9}$/.test(normalizeDigits(recipient.phone)))return 'شماره موبایل معتبر وارد کن.';
  if(recipient.province.trim().length<2||recipient.city.trim().length<2||recipient.address.trim().length<10)return 'استان، شهر و نشانی کامل را وارد کن.';
  if(!/^\d{10}$/.test(normalizeDigits(recipient.postalCode)))return 'کد پستی ۱۰ رقمی را وارد کن.';
  if(!items.length)return 'حداقل یک محصول به سفارش اضافه کن.';
  if(items.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>1000||!Number.isSafeInteger(i.unitPriceToman)||i.unitPriceToman<0))return 'تعداد و قیمت محصولات را بررسی کن.';
  if(!shipping||!Number.isSafeInteger(shippingFee)||shippingFee<0)return 'روش و هزینه ارسال را بررسی کن.';
  return '';
 }
 async function save(){if(busy||locked)return;setBusy(true);setError('');try{const result=await api<AdminOrder>('/admin/orders/'+order.id,{method:'PUT',body:JSON.stringify({version:order.version,status,recipient,shippingMethodId:shippingId,shippingFeeToman:shippingFee,items:items.map(({productId,variantId,quantity,unitPriceToman})=>({productId,variantId,quantity,unitPriceToman}))})});onSaved(result);void refreshOrders();notify('سفارش ذخیره شد.');}catch(e){setError(e instanceof Error?e.message:'ذخیره انجام نشد.');}finally{setBusy(false);setConfirm(false);}}
 function submit(e:FormEvent){e.preventDefault();const problem=validate();setError(problem);if(problem)return;if(status==='delivered')setConfirm(true);else void save();}
 const candidates=products.filter(p=>p.status==='active'&&normalizeSearch(p.name+' '+p.brand).includes(normalizeSearch(query))).slice(0,16);
 const updateItem=(index:number,patch:Partial<AdminOrderItem>)=>setItems(current=>current.map((i,n)=>n===index?{...i,...patch}:i));
 return <>
 <AdminPageHeading title={<>سفارش <bdi dir="ltr">#{order.number}</bdi></>} description={order.dateLabel+' · '+order.userName} action={<Link href="/admin/orders" className="admin-button"><AdminIcon name="arrow-right" size={18}/>همه سفارشات</Link>}/>
 {locked&&<div className="admin-lock-notice"><AdminIcon name="lock"/><div><strong>این سفارش تکمیل شده است.</strong><p>جزئیات سفارش برای حفظ سابقه خرید قابل ویرایش نیست.</p></div><AdminBadge status="delivered"/></div>}
 <form noValidate onSubmit={submit} className="admin-order-edit-layout"><div className="admin-order-main">
 <AdminPanel title="گیرنده و نشانی تحویل"><fieldset disabled={locked||busy} className="admin-edit-fieldset"><div className="admin-form-grid">
 {([['name','نام و نام خانوادگی'],['phone','شماره موبایل'],['province','استان'],['city','شهر'],['postalCode','کد پستی']] as const).map(([key,label])=><label className="admin-form-field" key={key}><span>{label}</span><input value={recipient[key]} dir={key==='phone'||key==='postalCode'?'ltr':undefined} inputMode={key==='phone'||key==='postalCode'?'numeric':undefined} onChange={e=>setRecipient({...recipient,[key]:e.target.value})}/></label>)}
 <label className="admin-form-field admin-span-all"><span>نشانی کامل</span><textarea rows={3} value={recipient.address} onChange={e=>setRecipient({...recipient,address:e.target.value})}/></label>
 <label className="admin-form-field admin-span-all"><span>یادداشت سفارش</span><textarea rows={2} value={recipient.note} onChange={e=>setRecipient({...recipient,note:e.target.value})}/></label>
 </div></fieldset></AdminPanel>
 <AdminPanel title="محصولات سفارش" action={!locked&&<button type="button" className="admin-button" disabled={busy} onClick={()=>setPicker(true)}><AdminIcon name="plus" size={18}/>افزودن محصول</button>}>
 <fieldset disabled={locked||busy} className="admin-edit-fieldset"><div className="admin-edit-order-lines">{items.map((item,index)=><div key={item.productId+'-'+item.variantId} className="admin-edit-order-line">
 <div className="admin-line-product">{item.image&&<Image src={item.image} alt="" width={52} height={64}/>}<div><strong>{item.name}</strong><small>{item.variantLabel}</small></div></div>
 <label className="admin-form-field"><span>تعداد</span><input aria-label={'تعداد '+item.name} type="number" min={1} max={1000} value={item.quantity} onChange={e=>updateItem(index,{quantity:Number(e.target.value)})}/></label>
 <label className="admin-form-field"><span>قیمت واحد · تومان</span><input aria-label={'قیمت '+item.name} type="number" min={0} value={item.unitPriceToman} onChange={e=>updateItem(index,{unitPriceToman:Number(e.target.value)})}/></label>
 <strong className="admin-line-total">{formatPrice(item.quantity*item.unitPriceToman)} <small>تومان</small></strong>
 <button type="button" className="admin-icon-button" aria-label={'حذف '+item.name+' از سفارش'} onClick={()=>setItems(items.filter((_,n)=>n!==index))}><AdminIcon name="trash" size={18}/></button>
 </div>)}</div></fieldset>{!items.length&&<p className="admin-muted">محصولی در سفارش نیست. یک محصول اضافه کن.</p>}
 </AdminPanel></div>
 <aside className="admin-order-summary admin-glass"><h2>مدیریت سفارش</h2><Link className="admin-button" href={'/admin/orders/receipts?order='+order.number}>فیش‌های این سفارش</Link><p className="admin-small">وضعیت پرداخت: {order.paymentStatus==='paid'?'تأیید شده':order.paymentStatus==='rejected'?'فیش رد شده':'تأیید نشده'}</p><AdminBadge status={order.status}/>
 <label className="admin-form-field"><span>وضعیت سفارش</span><select disabled={locked||busy} value={status} onChange={e=>setStatus(e.target.value as AdminOrderStatus)}>{Object.entries(orderStatusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label className="admin-form-field"><span>روش ارسال</span><select disabled={locked||busy} value={shippingId} onChange={e=>{setShippingId(e.target.value);setFee(methods.find(m=>m.id===e.target.value)?.feeToman??0);}}>{methods.filter(m=>m.active||m.id===order.shipping?.id).map(m=><option value={m.id} key={m.id}>{m.name}{m.type==='collect'?' · پس‌کرایه':''}</option>)}</select></label>
 <label className="admin-form-field"><span>هزینه ارسال · تومان</span><input type="number" min={0} value={shippingFee} disabled={locked||busy||shipping?.type==='collect'} onChange={e=>setFee(Number(e.target.value))}/></label>
 <dl className="admin-order-totals"><div><dt>جمع محصولات</dt><dd>{formatPrice(subtotal)} تومان</dd></div><div><dt>ارسال</dt><dd>{shipping?.type==='collect'?'پس‌کرایه':formatPrice(shippingFee)+' تومان'}</dd></div><div><dt>جمع نهایی</dt><dd>{formatPrice(subtotal+shippingFee)} تومان</dd></div></dl>
 <p className="admin-small admin-muted">پرداخت آنلاین انجام نشده است.</p>
 {error&&<p role="alert" className="admin-form-error">{error}</p>}
 {!locked&&<button type="submit" className="admin-button admin-button-primary" disabled={busy}><AdminIcon name="check" size={18}/>{busy?'در حال ذخیره…':'ذخیره تغییرات سفارش'}</button>}
 {status==='cancelled'&&!locked&&<p className="admin-small admin-muted">با لغو سفارش موجودی رزروشده آزاد می‌شود.</p>}
 </aside></form>
 {confirm&&<AdminModal title="تکمیل و قفل سفارش" onClose={()=>{if(!busy)setConfirm(false);}}><p>پس از تکمیل، محصولات، نشانی، ارسال و وضعیت این سفارش دیگر قابل تغییر نیستند.</p><div className="admin-form-actions"><button className="admin-button admin-button-primary" disabled={busy} onClick={()=>void save()}>تأیید و تکمیل سفارش</button><button className="admin-button" disabled={busy} onClick={()=>setConfirm(false)}>بازگشت</button></div></AdminModal>}
 {picker&&<AdminModal title="افزودن محصول به سفارش" wide onClose={()=>setPicker(false)}><label className="admin-search-field"><AdminIcon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="نام محصول یا برند..." aria-label="جستجوی محصول" data-admin-autofocus/></label><div className="admin-product-picker">{candidates.map(p=>{
 const variants=p.variants.length?p.variants:[{id:p.id+'-default',label:'بسته‌بندی اصلی',stock:p.stock,priceToman:p.priceToman}];
 const v=variants.find(v=>v.id===choices[p.id])??variants.find(v=>v.stock!==0)??variants[0];
 return <div className="admin-picker-item" key={p.id}><Image src={p.image||'/brand/poostikal-wordmark-transparent.png'} alt="" width={48} height={58}/><div><strong>{p.name}</strong><select aria-label={'بسته‌بندی '+p.name} value={v.id} onChange={e=>setChoices({...choices,[p.id]:e.target.value})}>{variants.map(v=><option value={v.id} key={v.id} disabled={v.stock===0}>{v.label}</option>)}</select><span>{formatPrice(v.priceToman??p.priceToman)} تومان</span></div><button className="admin-button" disabled={v.stock===0} onClick={()=>{const productId=p.id.replace(/^raboteb-/,'catalog-'),variantId=v.id.replace(/^raboteb-/,'catalog-');const existing=items.findIndex(i=>i.productId===productId&&i.variantId===variantId);if(existing>=0)updateItem(existing,{quantity:items[existing].quantity+1});else setItems([...items,{productId,variantId,name:p.name,brand:p.brand,image:p.image||'',variantLabel:v.label,quantity:1,unitPriceToman:v.priceToman??p.priceToman}]);setPicker(false);}}><AdminIcon name="plus" size={18}/>افزودن</button></div>;
 })}{!candidates.length&&<p className="admin-muted">محصولی پیدا نشد.</p>}</div></AdminModal>}
 </>;
}
