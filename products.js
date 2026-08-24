function authorized(request, env) {
  const h = request.headers.get('Authorization') || '';
  return !!env.ADMIN_TOKEN && h === `Bearer ${env.ADMIN_TOKEN}`;
}
function json(data, status=200) {
  return Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
}
export async function onRequest(context) {
  const {request, env} = context;
  if (request.method === 'GET') {
    const {results} = await env.DB.prepare(`SELECT id,name,price,image,desc,type,featured,best,rating,reviews,cover FROM products ORDER BY id ASC`).all();
    return json({ok:true, products:results.map(p=>({...p,featured:!!p.featured,best:!!p.best}))});
  }
  if (!authorized(request, env)) return json({ok:false,error:'دسترسی غیرمجاز'},401);
  try {
    if (request.method === 'POST') {
      const p = await request.json();
      const id = Number(p.id || Date.now());
      await env.DB.prepare(`INSERT INTO products (id,name,price,image,desc,type,featured,best,rating,reviews,cover) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,String(p.name||''),Number(p.price||0),String(p.image||''),String(p.desc||''),String(p.type||'فروشگاه'),p.featured?1:0,p.best?1:0,String(p.rating||'۵.۰'),String(p.reviews||'۰'),String(p.cover||'ThinkShop')).run();
      return json({ok:true,id});
    }
    if (request.method === 'PUT') {
      const p = await request.json(); const id=Number(p.id);
      if (!id) return json({ok:false,error:'شناسه محصول نامعتبر است.'},400);
      await env.DB.prepare(`UPDATE products SET name=?,price=?,image=?,desc=?,type=?,featured=?,best=?,rating=?,reviews=?,cover=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(String(p.name||''),Number(p.price||0),String(p.image||''),String(p.desc||''),String(p.type||'فروشگاه'),p.featured?1:0,p.best?1:0,String(p.rating||'۵.۰'),String(p.reviews||'۰'),String(p.cover||'ThinkShop'),id).run();
      return json({ok:true});
    }
    if (request.method === 'DELETE') {
      const url=new URL(request.url); const id=Number(url.searchParams.get('id'));
      if (!id) return json({ok:false,error:'شناسه محصول نامعتبر است.'},400);
      await env.DB.prepare(`DELETE FROM products WHERE id=?`).bind(id).run();
      return json({ok:true});
    }
    return json({ok:false,error:'Method Not Allowed'},405);
  } catch (e) {
    return json({ok:false,error:e.message||'خطای پایگاه داده'},500);
  }
}
