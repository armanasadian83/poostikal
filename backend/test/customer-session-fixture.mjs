import {createHash, randomBytes, randomUUID} from 'node:crypto';

export async function buyerSession(db,phone='09125559900'){
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  await db.query('INSERT INTO customers(id,phone,document) VALUES($1,$2,$3)',[id,phone,{phone,name:'خریدار تست'}]);
  await db.query("INSERT INTO customer_sessions VALUES($1,$2,now()+interval '1 day')",[createHash('sha256').update(token).digest('hex'),id]);
  return {id,token,cookie:'poostikal_customer='+token,req:{cookies:{poostikal_customer:token}}};
}
