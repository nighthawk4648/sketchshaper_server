import http from "http";

// A stand-in for Polar's API, used only by tests. Its products carry the plan and period in their metadata,
// like the real ones. There is no sponsor-yearly product, and an archived duplicate of pro-monthly comes first.
export async function startFakePolar() {
  const calls = { checkouts: [], sessions: [], products: 0, auth: [] };
  const state = { fail: false };
  const product = (plan, period, over = {}) => ({
    id: `prod-${plan}-${period}`,
    is_archived: false,
    metadata: { plan, period },
    ...over,
  });
  const products = [
    product("pro", "monthly", { id: "prod-pro-monthly-old", is_archived: true }),
    product("early_access", "monthly"),
    product("early_access", "yearly"),
    product("pro", "monthly"),
    product("pro", "yearly"),
    product("sponsor", "monthly"),
    { id: "prod-untagged", is_archived: false, metadata: {} },
  ];

  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readJson = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data ? JSON.parse(data) : {}));
    });

  const server = http.createServer(async (req, res) => {
    calls.auth.push(req.headers.authorization);
    if (state.fail) return json(res, 500, { error: "boom" });
    if (req.method === "GET" && req.url.startsWith("/products/")) {
      calls.products += 1;
      return json(res, 200, { items: products });
    }
    if (req.method === "POST" && req.url === "/checkouts/") {
      const body = await readJson(req);
      calls.checkouts.push(body);
      return json(res, 201, { id: "co-1", url: `https://polar.test/checkout/${body.products[0]}` });
    }
    if (req.method === "POST" && req.url === "/customer-sessions/") {
      const body = await readJson(req);
      calls.sessions.push(body);
      return json(res, 201, { customer_portal_url: `https://polar.test/portal/${body.external_customer_id}` });
    }
    json(res, 404, { error: "not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, state, close: () => server.close() };
}
