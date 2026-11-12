import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jsonwebtoken from "jsonwebtoken";

import enterpriseRoutes from "../app/routes/enterprise.js";
import rabbitmq from "../app/lib/rabbitmq.js";
import { PRIVATE_KEY, JWT_ALGORITHM } from "../app/utils/jwtKeys.js";

function request(server, method, reqPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path: reqPath,
        method,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            // noop
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            json,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("Enterprise Logout (/api/enterprise/auth/logout)", () => {
  let server;
  let enterpriseJwt;
  let userJwt;

  before(async () => {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/enterprise", enterpriseRoutes);

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });

    enterpriseJwt = jsonwebtoken.sign(
      {
        enterprise_id: "ent-test-123",
        email: "org@example.com",
        role: "enterprise",
      },
      PRIVATE_KEY,
      { expiresIn: "1h", algorithm: JWT_ALGORITHM },
    );

    userJwt = jsonwebtoken.sign(
      {
        userId: "user-test-456",
        email: "user@example.com",
        role: "user",
      },
      PRIVATE_KEY,
      { expiresIn: "1h", algorithm: JWT_ALGORITHM },
    );
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await rabbitmq.close();
  });

  it("POST /api/enterprise/auth/logout returns 200 and clears enterprise_access_token cookie", async () => {
    const res = await request(server, "POST", "/api/enterprise/auth/logout", {
      Cookie: `enterprise_access_token=${enterpriseJwt}`,
      Authorization: `Bearer ${enterpriseJwt}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.json?.status, "Success");

    const setCookies = res.headers["set-cookie"] || [];
    const clearedEnterprise = setCookies.find((c) =>
      c.startsWith("enterprise_access_token=;"),
    );
    assert.ok(clearedEnterprise, "Expected Set-Cookie clearing enterprise_access_token");
    assert.match(clearedEnterprise, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    assert.match(clearedEnterprise, /Path=\//i);
    assert.match(clearedEnterprise, /HttpOnly/i);
  });

  it("GET /api/enterprise/auth/logout remains supported and clears enterprise_access_token cookie", async () => {
    const res = await request(server, "GET", "/api/enterprise/auth/logout", {
      Cookie: `enterprise_access_token=${enterpriseJwt}`,
    });

    assert.equal(res.status, 200);
    const setCookies = res.headers["set-cookie"] || [];
    assert.ok(
      setCookies.some((c) => c.startsWith("enterprise_access_token=;")),
      "Expected GET logout to clear enterprise_access_token cookie",
    );
  });

  it("clears access_token cookie when it contains an enterprise JWT (e.g. unified login)", async () => {
    const res = await request(server, "POST", "/api/enterprise/auth/logout", {
      Cookie: `enterprise_access_token=${enterpriseJwt}; access_token=${enterpriseJwt}`,
    });

    assert.equal(res.status, 200);
    const setCookies = res.headers["set-cookie"] || [];
    assert.ok(
      setCookies.some((c) => c.startsWith("enterprise_access_token=;")),
      "Expected enterprise_access_token to be cleared",
    );
    assert.ok(
      setCookies.some((c) => c.startsWith("access_token=;")),
      "Expected shared enterprise access_token cookie to be cleared",
    );
  });

  it("preserves personal B2C access_token cookie when it belongs to a regular user", async () => {
    const res = await request(server, "POST", "/api/enterprise/auth/logout", {
      Cookie: `enterprise_access_token=${enterpriseJwt}; access_token=${userJwt}`,
    });

    assert.equal(res.status, 200);
    const setCookies = res.headers["set-cookie"] || [];
    assert.ok(
      setCookies.some((c) => c.startsWith("enterprise_access_token=;")),
      "Expected enterprise_access_token to be cleared",
    );
    assert.ok(
      !setCookies.some((c) => c.startsWith("access_token=;")),
      "Expected personal user access_token cookie NOT to be cleared",
    );
  });
});
