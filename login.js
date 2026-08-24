export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => ({}));
  const password = String(body.password || '');
  if (!context.env.ADMIN_PASSWORD || password !== context.env.ADMIN_PASSWORD) {
    return Response.json({ ok:false, error:'رمز مدیریت اشتباه است.' }, { status:401 });
  }
  if (!context.env.ADMIN_TOKEN) {
    return Response.json({ ok:false, error:'ADMIN_TOKEN در Cloudflare تنظیم نشده است.' }, { status:500 });
  }
  return Response.json({ ok:true, token:context.env.ADMIN_TOKEN });
}
