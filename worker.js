function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function authorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  return !!env.ADMIN_TOKEN && h === `Bearer ${env.ADMIN_TOKEN}`;
}

async function productsApi(request, env) {
  if (!env.DB) return json({ ok: false, error: "D1 binding DB پیدا نشد." }, 500);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id,name,price,image,desc,type,featured,best,rating,reviews,cover FROM products ORDER BY id ASC`
    ).all();
    return json({
      ok: true,
      products: results.map(p => ({ ...p, featured: !!p.featured, best: !!p.best }))
    });
  }

  if (!authorized(request, env)) return json({ ok: false, error: "دسترسی غیرمجاز" }, 401);

  if (request.method === "POST") {
    const p = await request.json();
    const id = Number(p.id || Date.now());
    await env.DB.prepare(
      `INSERT INTO products (id,name,price,image,desc,type,featured,best,rating,reviews,cover)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      String(p.name || ""),
      Number(p.price || 0),
      String(p.image || ""),
      String(p.desc || ""),
      String(p.type || "فروشگاه"),
      p.featured ? 1 : 0,
      p.best ? 1 : 0,
      String(p.rating || "۵.۰"),
      String(p.reviews || "۰"),
      String(p.cover || "ThinkShop")
    ).run();
    return json({ ok: true, id });
  }

  if (request.method === "PUT") {
    const p = await request.json();
    const id = Number(p.id);
    if (!id) return json({ ok: false, error: "شناسه محصول نامعتبر است." }, 400);
    await env.DB.prepare(
      `UPDATE products SET name=?,price=?,image=?,desc=?,type=?,featured=?,best=?,rating=?,reviews=?,cover=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      String(p.name || ""), Number(p.price || 0), String(p.image || ""),
      String(p.desc || ""), String(p.type || "فروشگاه"), p.featured ? 1 : 0,
      p.best ? 1 : 0, String(p.rating || "۵.۰"), String(p.reviews || "۰"),
      String(p.cover || "ThinkShop"), id
    ).run();
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return json({ ok: false, error: "شناسه محصول نامعتبر است." }, 400);
    await env.DB.prepare(`DELETE FROM products WHERE id=?`).bind(id).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method Not Allowed" }, 405);
}

async function loginApi(request, env) {
  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "");
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return json({ ok: false, error: "رمز مدیریت اشتباه است." }, 401);
  }
  if (!env.ADMIN_TOKEN) {
    return json({ ok: false, error: "ADMIN_TOKEN در Cloudflare تنظیم نشده است." }, 500);
  }
  return json({ ok: true, token: env.ADMIN_TOKEN });
}

async function settingsApi(request, env) {
  if (!env.DB) return json({ ok: false, error: "D1 binding DB پیدا نشد." }, 500);
  if (!authorized(request, env)) return json({ ok: false, error: "دسترسی غیرمجاز" }, 401);

  if (request.method === "GET") {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key='gateway'`).first();
    let gateway = {};
    try { gateway = JSON.parse(row?.value || "{}"); } catch {}
    return json({ ok: true, gateway });
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const gateway = {
      gatewayName: String(body.gatewayName || ""),
      gatewayUrl: String(body.gatewayUrl || ""),
      merchantId: String(body.merchantId || ""),
      enabled: !!body.enabled
    };
    await env.DB.prepare(
      `INSERT INTO settings(key,value) VALUES('gateway',?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).bind(JSON.stringify(gateway)).run();
    return json({ ok: true, gateway });
  }

  return json({ ok: false, error: "Method Not Allowed" }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/products") return await productsApi(request, env);
      if (url.pathname === "/api/admin/login") return await loginApi(request, env);
      if (url.pathname === "/api/admin/settings") return await settingsApi(request, env);

      // Everything else is served from the existing index.html/static files.
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Thinkshop assets binding ASSETS پیدا نشد.", { status: 500 });
    } catch (e) {
      return json({ ok: false, error: e?.message || "خطای سرور" }, 500);
    }
  }
};
