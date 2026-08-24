function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}
function cookie(name, value, maxAge = 2592000, sameSite = "Lax") {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}`;
}
function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}
function adminAuthorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
  return !!env.ADMIN_TOKEN && (bearer === env.ADMIN_TOKEN || getCookie(request, "thinkshop_admin") === env.ADMIN_TOKEN);
}
function requireDB(env) { if (!env.DB) throw new Error("D1 binding با نام DB پیدا نشد."); }
const DEFAULT_SITE_INFO={
  about:"ThinkShop یک فروشگاه فارسی برای بازی‌های فکری، سرگرمی، آموزشی و هدیه است؛ جایی برای انتخاب‌های دوست‌داشتنی و خنده‌های از ته دل.",
  contact:"برای ارتباط با ThinkShop، اطلاعات تماس رسمی فروشگاه را از پنل مدیریت وارد کنید.",
  phone:"", email:"", instagram:"", whatsapp:"", address:"",
  terms:"خرید از ThinkShop به معنی پذیرش شرایط خرید، پرداخت، ارسال، لغو و مرجوعی فروشگاه است. جزئیات این شرایط را از پنل مدیریت می‌توانید ویرایش کنید.",
  privacy:"اطلاعات حساب و سفارش مشتری فقط برای ارائه خدمات فروشگاه، ثبت سفارش، ارسال و پشتیبانی استفاده می‌شود. جزئیات سیاست حریم خصوصی را از پنل مدیریت می‌توانید ویرایش کنید."
};
async function siteInfoApi(request,env){
  requireDB(env);
  const row=await env.DB.prepare("SELECT value FROM settings WHERE key='site_info'").first();
  let info={}; try{info={...DEFAULT_SITE_INFO,...JSON.parse(row?.value||"{}")}}catch{info={...DEFAULT_SITE_INFO}}
  if(request.method==='GET') return json({ok:true,info});
  if(!adminAuthorized(request,env)) return json({ok:false,error:"دسترسی غیرمجاز"},401);
  if(request.method==='PUT'){
    const p=await body(request);
    const info={...DEFAULT_SITE_INFO};
    for(const k of Object.keys(info)) if(p[k]!==undefined) info[k]=String(p[k]??'').trim();
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES('site_info',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(info)).run();
    return json({ok:true,info});
  }
  return json({ok:false,error:"Method Not Allowed"},405);
}
async function body(request) { return request.json().catch(() => ({})); }
async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function customer(request, env) {
  requireDB(env);
  const token = getCookie(request, "thinkshop_session");
  if (!token) return null;
  return await env.DB.prepare(`
    SELECT c.id,c.name,c.username,c.phone,c.email,c.created_at
    FROM customer_sessions s JOIN customers c ON c.id=s.customer_id
    WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP
  `).bind(token).first();
}
async function requireCustomer(request, env) {
  const c = await customer(request, env);
  if (!c) return json({ok:false,error:"برای این عملیات ابتدا وارد حساب کاربری شوید."},401);
  return c;
}



async function addInventoryMovement(env,{productId,orderId=null,changeQty,reason,note=""}){
  try{
    await env.DB.prepare("INSERT INTO inventory_movements(product_id,quantity,type,reference_id,note) VALUES(?,?,?,?,?)").bind(productId,changeQty,reason,orderId,note).run();
    return;
  }catch(e){}
  try{
    await env.DB.prepare("INSERT INTO inventory_movements(product_id,order_id,change_quantity,reason,note) VALUES(?,?,?,?,?)").bind(productId,orderId,changeQty,reason,note).run();
    return;
  }catch(e){}
  // Older databases may not have inventory movement logging; never fail a valid commerce action solely because the audit table differs.
}

async function healthApi(request,env){
  try{
    requireDB(env);
    const tables=["products","settings","customers","customer_sessions","addresses","carts","cart_items","orders","order_items","order_status_history","payments","inventory","inventory_movements"];
    const out={ok:true,db:true,tables:{}};
    for(const t of tables){
      try{await env.DB.prepare(`SELECT 1 FROM ${t} LIMIT 1`).first();out.tables[t]=true}
      catch(e){out.tables[t]=false}
    }
    return json(out);
  }catch(e){return json({ok:false,db:false,error:e?.message||"D1 unavailable"},500)}
}

async function productsApi(request, env) {
  requireDB(env);
  if (request.method === "GET") {
    const {results} = await env.DB.prepare(`SELECT p.id,p.name,p.price,p.image,p.desc,p.type,p.featured,p.best,p.rating,p.reviews,p.cover,p.created_at,p.updated_at,COALESCE(i.stock,0) stock FROM products p LEFT JOIN inventory i ON i.product_id=p.id ORDER BY p.id ASC`).all();
    return json({ok:true,products:results.map(p=>({...p,featured:!!p.featured,best:!!p.best}))});
  }
  if (!adminAuthorized(request,env)) return json({ok:false,error:"دسترسی غیرمجاز"},401);
  if (request.method === "POST") {
    const p=await body(request), name=String(p.name||"").trim(), price=Number(p.price);
    if(!name||!Number.isFinite(price)||price<0)return json({ok:false,error:"نام و قیمت معتبر الزامی است."},400);
    const id=Number(p.id||Date.now()), stock=Number.isInteger(Number(p.stock))?Math.max(0,Number(p.stock)):0;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO products(id,name,price,image,desc,type,featured,best,rating,reviews,cover) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,name,Math.round(price),String(p.image||""),String(p.desc||""),String(p.type||"فروشگاه"),p.featured?1:0,p.best?1:0,String(p.rating||"۵.۰"),String(p.reviews||"۰"),String(p.cover||"ThinkShop")),
      env.DB.prepare(`INSERT INTO inventory(product_id,stock) VALUES(?,?) ON CONFLICT(product_id) DO UPDATE SET stock=excluded.stock,updated_at=CURRENT_TIMESTAMP`).bind(id,stock),
    ]);
    await addInventoryMovement(env,{productId:id,changeQty:stock,reason:"initial",note:"ایجاد محصول"});
    return json({ok:true,id},201);
  }
  if (request.method === "PUT") {
    const p=await body(request),id=Number(p.id),name=String(p.name||"").trim(),price=Number(p.price);
    if(!id||!name||!Number.isFinite(price)||price<0)return json({ok:false,error:"اطلاعات محصول نامعتبر است."},400);
    const old=await env.DB.prepare("SELECT stock FROM inventory WHERE product_id=?").bind(id).first();
    const stock=Number.isFinite(Number(p.stock))?Math.max(0,Number(p.stock)):Number(old?.stock||0);
    const r=await env.DB.prepare(`UPDATE products SET name=?,price=?,image=?,desc=?,type=?,featured=?,best=?,rating=?,reviews=?,cover=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name,Math.round(price),String(p.image||""),String(p.desc||""),String(p.type||"فروشگاه"),p.featured?1:0,p.best?1:0,String(p.rating||"۵.۰"),String(p.reviews||"۰"),String(p.cover||"ThinkShop"),id).run();
    if(!r.meta?.changes)return json({ok:false,error:"محصول پیدا نشد."},404);
    await env.DB.prepare(`INSERT INTO inventory(product_id,stock) VALUES(?,?) ON CONFLICT(product_id) DO UPDATE SET stock=excluded.stock,updated_at=CURRENT_TIMESTAMP`).bind(id,stock).run();
    return json({ok:true});
  }
  if (request.method === "DELETE") {
    const id=Number(new URL(request.url).searchParams.get("id"));
    if(!id)return json({ok:false,error:"شناسه محصول نامعتبر است."},400);
    const r=await env.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
    return r.meta?.changes?json({ok:true}):json({ok:false,error:"محصول پیدا نشد."},404);
  }
  return json({ok:false,error:"Method Not Allowed"},405);
}

async function adminLogin(request,env){
  if(request.method!=="POST")return json({ok:false,error:"Method Not Allowed"},405);
  const p=await body(request);
  if(!env.ADMIN_PASSWORD||String(p.password||"")!==env.ADMIN_PASSWORD)return json({ok:false,error:"رمز مدیریت اشتباه است."},401);
  if(!env.ADMIN_TOKEN)return json({ok:false,error:"ADMIN_TOKEN در Cloudflare تنظیم نشده است."},500);
  return json({ok:true},200,{"Set-Cookie":cookie("thinkshop_admin",env.ADMIN_TOKEN,86400,"Strict")});
}
async function adminLogout(){return json({ok:true},200,{"Set-Cookie":cookie("thinkshop_admin","",-1,"Strict")});}
async function adminMe(request,env){const ok=adminAuthorized(request,env);return json({ok},ok?200:401);}

async function registerApi(request,env){
  if(request.method!=="POST")return json({ok:false,error:"Method Not Allowed"},405); requireDB(env);
  const p=await body(request),name=String(p.name||"").trim(),username=String(p.username||"").trim(),phone=String(p.phone||"").trim(),password=String(p.password||"");
  if(!name||!username||password.length<6)return json({ok:false,error:"نام، نام کاربری و رمز حداقل ۶ کاراکتری الزامی است."},400);
  const exists=await env.DB.prepare("SELECT id FROM customers WHERE username=? OR (phone<>'' AND phone=?)").bind(username,phone).first();
  if(exists)return json({ok:false,error:"نام کاربری یا شماره موبایل قبلاً ثبت شده است."},409);
  const r=await env.DB.prepare("INSERT INTO customers(name,username,phone,password_hash) VALUES(?,?,?,?)").bind(name,username,phone,await sha256(password)).run();
  const id=Number(r.meta.last_row_id),token=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO customer_sessions(token,customer_id,expires_at) VALUES(?,?,datetime('now','+30 day'))").bind(token,id).run();
  return json({ok:true,customer:{id,name,username,phone}},201,{"Set-Cookie":cookie("thinkshop_session",token)});
}
async function userLogin(request,env){
  if(request.method!=="POST")return json({ok:false,error:"Method Not Allowed"},405); requireDB(env);
  const p=await body(request),username=String(p.username||"").trim(),password=String(p.password||"");
  const c=await env.DB.prepare("SELECT id,name,username,phone,email,password_hash FROM customers WHERE username=?").bind(username).first();
  if(!c||c.password_hash!==await sha256(password))return json({ok:false,error:"نام کاربری یا رمز عبور اشتباه است."},401);
  const token=crypto.randomUUID(); await env.DB.prepare("INSERT INTO customer_sessions(token,customer_id,expires_at) VALUES(?,?,datetime('now','+30 day'))").bind(token,c.id).run(); delete c.password_hash;
  return json({ok:true,customer:c},200,{"Set-Cookie":cookie("thinkshop_session",token)});
}
async function userLogout(request,env){const token=getCookie(request,"thinkshop_session");if(token&&env.DB)await env.DB.prepare("DELETE FROM customer_sessions WHERE token=?").bind(token).run();return json({ok:true},200,{"Set-Cookie":cookie("thinkshop_session","",-1)});}
async function userMe(request,env){const c=await customer(request,env);return c?json({ok:true,customer:c}):json({ok:false,error:"وارد نشده‌اید."},401);}

async function addressesApi(request,env){
  const c=await requireCustomer(request,env); if(c instanceof Response)return c; requireDB(env);
  if(request.method==="GET"){const {results}=await env.DB.prepare("SELECT * FROM addresses WHERE customer_id=? ORDER BY id DESC").bind(c.id).all();return json({ok:true,addresses:results});}
  if(request.method==="POST"){const p=await body(request);if(!String(p.city||"").trim()||!String(p.address||"").trim())return json({ok:false,error:"شهر و آدرس کامل الزامی است."},400);const r=await env.DB.prepare(`INSERT INTO addresses(customer_id,title,receiver_name,receiver_mobile,province,city,address,postal_code) VALUES(?,?,?,?,?,?,?,?)`).bind(c.id,String(p.title||"آدرس اصلی"),String(p.receiver_name||c.name),String(p.receiver_mobile||c.phone||""),String(p.province||""),String(p.city),String(p.address),String(p.postal_code||"")).run();return json({ok:true,id:r.meta.last_row_id},201);}
  if(request.method==="DELETE"){const id=Number(new URL(request.url).searchParams.get("id"));await env.DB.prepare("DELETE FROM addresses WHERE id=? AND customer_id=?").bind(id,c.id).run();return json({ok:true});}
  return json({ok:false,error:"Method Not Allowed"},405);
}

async function cartApi(request,env){
  const c=await requireCustomer(request,env);if(c instanceof Response)return c;requireDB(env);
  let cart=await env.DB.prepare("SELECT id FROM carts WHERE customer_id=?").bind(c.id).first();
  if(!cart){const r=await env.DB.prepare("INSERT INTO carts(customer_id) VALUES(?)").bind(c.id).run();cart={id:Number(r.meta.last_row_id)};}
  if(request.method==="GET"){const {results}=await env.DB.prepare(`SELECT ci.id,ci.product_id,ci.quantity,p.name,p.price,p.image,p.type,COALESCE(i.stock,0) stock FROM cart_items ci JOIN products p ON p.id=ci.product_id LEFT JOIN inventory i ON i.product_id=p.id WHERE ci.cart_id=? ORDER BY ci.id DESC`).bind(cart.id).all();return json({ok:true,cart:{id:cart.id,items:results}});}
  const parts=new URL(request.url).pathname.split("/"); const itemId=Number(parts[3]);
  if(request.method==="POST"){const p=await body(request),pid=Number(p.product_id),qty=Math.max(1,Number(p.quantity||1));const prod=await env.DB.prepare("SELECT p.id,COALESCE(i.stock,0) stock FROM products p LEFT JOIN inventory i ON i.product_id=p.id WHERE p.id=?").bind(pid).first();if(!prod)return json({ok:false,error:"محصول پیدا نشد."},404);const current=await env.DB.prepare("SELECT quantity FROM cart_items WHERE cart_id=? AND product_id=?").bind(cart.id,pid).first();if(Number(current?.quantity||0)+qty>Number(prod.stock))return json({ok:false,error:"موجودی این محصول کافی نیست."},409);await env.DB.prepare(`INSERT INTO cart_items(cart_id,product_id,quantity) VALUES(?,?,?) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=CURRENT_TIMESTAMP`).bind(cart.id,pid,qty).run();return cartApi(new Request(request.url,{method:"GET",headers:request.headers}),env);}
  if(request.method==="PUT"){const p=await body(request),qty=Number(p.quantity);if(!itemId||!Number.isInteger(qty)||qty<1)return json({ok:false,error:"تعداد نامعتبر است."},400);const item=await env.DB.prepare(`SELECT ci.product_id,COALESCE(i.stock,0) stock FROM cart_items ci LEFT JOIN inventory i ON i.product_id=ci.product_id WHERE ci.id=? AND ci.cart_id=?`).bind(itemId,cart.id).first();if(!item)return json({ok:false,error:"آیتم سبد پیدا نشد."},404);if(qty>Number(item.stock))return json({ok:false,error:"موجودی این محصول کافی نیست."},409);await env.DB.prepare("UPDATE cart_items SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND cart_id=?").bind(qty,itemId,cart.id).run();return json({ok:true});}
  if(request.method==="DELETE"){await env.DB.prepare("DELETE FROM cart_items WHERE id=? AND cart_id=?").bind(itemId,cart.id).run();return json({ok:true});}
  return json({ok:false,error:"Method Not Allowed"},405);
}

async function ordersApi(request,env){
  const c=await requireCustomer(request,env);if(c instanceof Response)return c;requireDB(env);
  if(request.method==="GET"){const {results}=await env.DB.prepare("SELECT id,order_number,total,status,payment_status,customer_note,created_at,updated_at FROM orders WHERE customer_id=? ORDER BY id DESC").bind(c.id).all();return json({ok:true,orders:results});}
  if(request.method!=="POST")return json({ok:false,error:"Method Not Allowed"},405);
  const p=await body(request),addressId=Number(p.address_id),address=await env.DB.prepare("SELECT * FROM addresses WHERE id=? AND customer_id=?").bind(addressId,c.id).first();
  if(!address)return json({ok:false,error:"آدرس انتخاب‌شده معتبر نیست."},400);
  const cart=await env.DB.prepare("SELECT id FROM carts WHERE customer_id=?").bind(c.id).first();if(!cart)return json({ok:false,error:"سبد خرید خالی است."},400);
  const {results:items}=await env.DB.prepare(`SELECT ci.product_id,ci.quantity,p.name,p.price,COALESCE(i.stock,0) stock FROM cart_items ci JOIN products p ON p.id=ci.product_id LEFT JOIN inventory i ON i.product_id=ci.product_id WHERE ci.cart_id=?`).bind(cart.id).all();
  if(!items.length)return json({ok:false,error:"سبد خرید خالی است."},400);
  for(const x of items)if(Number(x.quantity)>Number(x.stock))return json({ok:false,error:`موجودی «${x.name}» کافی نیست.`},409);
  const total=items.reduce((s,x)=>s+Number(x.price)*Number(x.quantity),0),orderNo="TS-"+Date.now()+"-"+Math.floor(Math.random()*900+100);
  const r=await env.DB.prepare("INSERT INTO orders(order_number,customer_id,address_id,total,status,payment_status,customer_note) VALUES(?,?,?,?,?,?,?)").bind(orderNo,c.id,addressId,total,"pending","unpaid",String(p.customer_note||"")).run();
  const orderId=Number(r.meta.last_row_id),stmts=[env.DB.prepare("INSERT INTO payments(order_id,amount,status) VALUES(?,?,?)").bind(orderId,total,"unpaid"),env.DB.prepare("INSERT INTO order_status_history(order_id,status,note) VALUES(?,?,?)").bind(orderId,"pending","سفارش ثبت شد."),...items.map(x=>env.DB.prepare("INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity) VALUES(?,?,?,?,?)").bind(orderId,x.product_id,x.name,x.price,x.quantity)),env.DB.prepare("DELETE FROM cart_items WHERE cart_id=?").bind(cart.id),...items.map(x=>env.DB.prepare("UPDATE inventory SET stock=stock-?,updated_at=CURRENT_TIMESTAMP WHERE product_id=?").bind(x.quantity,x.product_id))];
  await env.DB.batch(stmts); for(const x of items) await addInventoryMovement(env,{productId:x.product_id,orderId,changeQty:-Number(x.quantity),reason:"sale",note:"ثبت سفارش"}); return json({ok:true,order:{id:orderId,order_number:orderNo,total,status:"pending",payment_status:"unpaid"}},201);
}
async function orderTracking(request,env,id){const c=await requireCustomer(request,env);if(c instanceof Response)return c;requireDB(env);const o=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").bind(id,c.id).first();if(!o)return json({ok:false,error:"سفارش پیدا نشد."},404);const {results:history}=await env.DB.prepare("SELECT status,note,created_at FROM order_status_history WHERE order_id=? ORDER BY id ASC").bind(id).all();return json({ok:true,order:o,history});}

async function adminOrders(request,env){
  if(!adminAuthorized(request,env))return json({ok:false,error:"دسترسی غیرمجاز"},401);requireDB(env);
  if(request.method==="GET"){const {results}=await env.DB.prepare(`SELECT o.*,c.name customer_name,c.phone customer_phone FROM orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.id DESC`).all();return json({ok:true,orders:results});}
  if(request.method==="PUT"){const id=Number(new URL(request.url).pathname.split("/").pop()),p=await body(request),status=String(p.status||"");const allowed=["pending","confirmed","processing","shipped","delivered","cancelled"];if(!allowed.includes(status))return json({ok:false,error:"وضعیت سفارش نامعتبر است."},400);const r=await env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();if(!r.meta?.changes)return json({ok:false,error:"سفارش پیدا نشد."},404);await env.DB.prepare("INSERT INTO order_status_history(order_id,status,note) VALUES(?,?,?)").bind(id,status,String(p.note||"")).run();return json({ok:true});}
  return json({ok:false,error:"Method Not Allowed"},405);
}
async function adminInventory(request,env){
  if(!adminAuthorized(request,env))return json({ok:false,error:"دسترسی غیرمجاز"},401);requireDB(env);
  if(request.method==="GET"){const {results}=await env.DB.prepare(`SELECT p.id,p.name,COALESCE(i.stock,0) stock,COALESCE(i.reserved,0) reserved FROM products p LEFT JOIN inventory i ON i.product_id=p.id ORDER BY p.id`).all();return json({ok:true,inventory:results});}
  if(request.method==="PUT"){const p=await body(request),id=Number(p.product_id),stock=Math.max(0,Number(p.stock));if(!id||!Number.isInteger(stock))return json({ok:false,error:"موجودی نامعتبر است."},400);const old=await env.DB.prepare("SELECT stock FROM inventory WHERE product_id=?").bind(id).first();await env.DB.prepare("INSERT INTO inventory(product_id,stock) VALUES(?,?) ON CONFLICT(product_id) DO UPDATE SET stock=excluded.stock,updated_at=CURRENT_TIMESTAMP").bind(id,stock).run();await addInventoryMovement(env,{productId:id,changeQty:stock-Number(old?.stock||0),reason:"adjustment",note:String(p.note||"تغییر موجودی توسط Admin")});return json({ok:true,stock});}
  return json({ok:false,error:"Method Not Allowed"},405);
}
async function settingsApi(request,env){if(!adminAuthorized(request,env))return json({ok:false,error:"دسترسی غیرمجاز"},401);requireDB(env);if(request.method==="GET"){const row=await env.DB.prepare("SELECT value FROM settings WHERE key='gateway'").first();let gateway={};try{gateway=JSON.parse(row?.value||"{}")}catch{}return json({ok:true,gateway});}if(request.method==="PUT"){const p=await body(request),gateway={gatewayName:String(p.gatewayName||""),gatewayUrl:String(p.gatewayUrl||""),merchantId:String(p.merchantId||""),enabled:!!p.enabled};await env.DB.prepare("INSERT INTO settings(key,value) VALUES('gateway',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(gateway)).run();return json({ok:true,gateway});}return json({ok:false,error:"Method Not Allowed"},405);}
async function paymentCreate(request,env){const c=await requireCustomer(request,env);if(c instanceof Response)return c;requireDB(env);if(request.method!=="POST")return json({ok:false,error:"Method Not Allowed"},405);const p=await body(request),o=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").bind(Number(p.order_id),c.id).first();if(!o)return json({ok:false,error:"سفارش پیدا نشد."},404);const row=await env.DB.prepare("SELECT value FROM settings WHERE key='gateway'").first();let g={};try{g=JSON.parse(row?.value||"{}")}catch{}if(!g.enabled||!g.gatewayUrl||!g.merchantId)return json({ok:false,error:"درگاه پرداخت هنوز در Cloudflare تنظیم نشده است.",code:"PAYMENT_GATEWAY_NOT_CONFIGURED"},409);return json({ok:false,error:"درگاه تنظیم شده اما Adapter اختصاصی آن هنوز پیاده‌سازی نشده است.",code:"PAYMENT_ADAPTER_REQUIRED"},501);}

export default {async fetch(request,env){const u=new URL(request.url);try{
  if(u.pathname==="/api/health")return await healthApi(request,env);
  if(u.pathname==="/api/products")return await productsApi(request,env);
  if(u.pathname==="/api/site-info")return await siteInfoApi(request,env);
  if(u.pathname==="/api/admin/login")return await adminLogin(request,env);
  if(u.pathname==="/api/admin/logout")return await adminLogout();
  if(u.pathname==="/api/admin/me")return await adminMe(request,env);
  if(u.pathname==="/api/admin/settings")return await settingsApi(request,env);
  if(u.pathname==="/api/admin/orders")return await adminOrders(request,env);
  if(u.pathname.startsWith("/api/admin/orders/"))return await adminOrders(request,env);
  if(u.pathname==="/api/admin/inventory")return await adminInventory(request,env);
  if(u.pathname==="/api/user/register")return await registerApi(request,env);
  if(u.pathname==="/api/user/login")return await userLogin(request,env);
  if(u.pathname==="/api/user/logout")return await userLogout(request,env);
  if(u.pathname==="/api/user/me")return await userMe(request,env);
  if(u.pathname==="/api/addresses")return await addressesApi(request,env);
  if(u.pathname==="/api/cart"||u.pathname.startsWith("/api/cart/"))return await cartApi(request,env);
  if(u.pathname==="/api/orders")return await ordersApi(request,env);
  if(u.pathname.startsWith("/api/orders/")&&u.pathname.endsWith("/tracking"))return await orderTracking(request,env,Number(u.pathname.split("/")[3]));
  if(u.pathname==="/api/payments/create")return await paymentCreate(request,env);
  if(env.ASSETS)return env.ASSETS.fetch(request);
  return json({ok:false,error:"ASSETS binding پیدا نشد."},500);
}catch(e){return json({ok:false,error:e?.message||"خطای سرور"},500);}}};
