import http from "http";

// A stand-in for Patreon, used only by tests. Identities look like:
// { id, email, name, verified, patron: { campaignId, cents, status } | null }
export async function startFakePatreon(port = 0) {
  let nextIdentity = null;
  const byCode = new Map();
  const byAccess = new Map();
  const byRefresh = new Map();
  const identities = new Map();
  let n = 0;
  const calls = { identity: 0, refresh: 0 };
  const state = { identityFailure: null, revoked: new Set() };

  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(new URLSearchParams(data)));
    });
  const issue = (id) => {
    n += 1;
    const tokens = { access_token: `at-${n}`, refresh_token: `rt-${n}`, expires_in: 3600 };
    byAccess.set(tokens.access_token, id);
    byRefresh.set(tokens.refresh_token, id);
    return tokens;
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://fake");
    if (url.pathname === "/oauth2/authorize") {
      n += 1;
      const code = `code-${n}`;
      byCode.set(code, nextIdentity);
      identities.set(nextIdentity.id, nextIdentity);
      const back = new URL(url.searchParams.get("redirect_uri"));
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state"));
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (url.pathname === "/api/oauth2/token") {
      const form = await readBody(req);
      if (form.get("grant_type") === "authorization_code") {
        const identity = byCode.get(form.get("code"));
        if (!identity) return json(res, 400, { error: "invalid_grant" });
        byCode.delete(form.get("code"));
        return json(res, 200, issue(identity.id));
      }
      calls.refresh += 1;
      const id = byRefresh.get(form.get("refresh_token"));
      if (!id || state.revoked.has(id)) return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, issue(id));
    }
    if (url.pathname === "/api/oauth2/v2/identity") {
      calls.identity += 1;
      if (state.identityFailure) return json(res, state.identityFailure, { error: "boom" });
      const id = byAccess.get((req.headers.authorization || "").replace("Bearer ", ""));
      const who = identities.get(id);
      if (!who) return json(res, 401, { error: "invalid_token" });
      return json(res, 200, {
        data: { id: who.id, attributes: { email: who.email, full_name: who.name, is_email_verified: who.verified } },
        included: who.patron
          ? [{
              type: "member",
              attributes: { patron_status: who.patron.status || "active_patron", currently_entitled_amount_cents: who.patron.cents },
              relationships: { campaign: { data: { id: who.patron.campaignId } } },
            }]
          : [],
      });
    }
    json(res, 404, {});
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    nextLogin: (identity) => (nextIdentity = identity),
    setPatron: (id, patron) => (identities.get(id).patron = patron),
    failIdentityWith: (status) => (state.identityFailure = status),
    revoke: (id) => state.revoked.add(id),
    close: () => server.close(),
  };
}
