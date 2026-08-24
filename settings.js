function authorized(request, env) {
  const h = request.headers.get('Authorization') || '';
  return !!env.ADMIN_TOKEN && h === `Bearer ${env.ADMIN_TOKEN}`;
}
function json(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
export async function onRequest(context){
  const {request,env}=context;
  if(!authorized(request,env)) return json({ok:false,error:'دسترسی غیرمجاز'},401);
  if(request.method==='GET'){
    const row=await env.DB.prepare(`SELECT value FROM settings WHERE key='gateway'`).first();
    let gateway={}; try{gateway=JSON.parse(row?.value||'{}')}catch{}
    return json({ok:true,gateway});
  }
  if(request.method==='PUT'){
    const body=await request.json();
    const gateway={gatewayName:String(body.gatewayName||''),gatewayUrl:String(body.gatewayUrl||''),merchantId:String(body.merchantId||''),enabled:!!body.enabled};
    await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('gateway',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(JSON.stringify(gateway)).run();
    return json({ok:true,gateway});
  }
  return json({ok:false,error:'Method Not Allowed'},405);
}
