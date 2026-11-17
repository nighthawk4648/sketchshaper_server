import http from "http";

// A stand-in for Google, used only by tests. Profiles look like { sub, email, name, verified }
export async function startFakeGoogle(port = 0) {
  let nextProfile = null;
  const byCode = new Map();
  const byToken = new Map();
  let n = 0;

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

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://fake");
    if (url.pathname === "/authorize") {
      n += 1;
      const code = `gcode-${n}`;
      byCode.set(code, nextProfile);
      const back = new URL(url.searchParams.get("redirect_uri"));
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state"));
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (url.pathname === "/token") {
      const form = await readBody(req);
      const profile = byCode.get(form.get("code"));
      if (!profile || form.get("client_secret") !== "g-secret") return json(res, 400, { error: "invalid_grant" });
      byCode.delete(form.get("code"));
      n += 1;
      byToken.set(`gat-${n}`, profile);
      return json(res, 200, { access_token: `gat-${n}`, expires_in: 3600 });
    }
    if (url.pathname === "/userinfo") {
      const p = byToken.get((req.headers.authorization || "").replace("Bearer ", ""));
      if (!p) return json(res, 401, { error: "invalid_token" });
      return json(res, 200, { sub: p.sub, email: p.email, name: p.name, email_verified: p.verified });
    }
    json(res, 404, {});
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    nextLogin: (profile) => (nextProfile = profile),
    close: () => server.close(),
  };
}
