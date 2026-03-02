import "dotenv/config";

function getArg(name: string, fallback?: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return arg.split("=")[1];
}

async function main() {
  const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5000";
  const repeats = Number(getArg("repeats", "1") || "1");
  const queryMode = getArg("queries", "all");

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@tracepilot.com", password: "admin123" }),
  });
  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status} ${await loginResponse.text()}`);
  }
  const cookie = loginResponse.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Login did not return a session cookie.");
  }

  const queryIds =
    queryMode && queryMode !== "all"
      ? queryMode.split(",").map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : undefined;

  const runResponse = await fetch(`${baseUrl}/api/admin/run-enterprise-eval-pack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      repeatCount: repeats,
      queryIds,
    }),
  });

  const payload = await runResponse.json().catch(() => ({}));
  if (!runResponse.ok) {
    throw new Error(`Enterprise eval pack failed: ${runResponse.status} ${JSON.stringify(payload)}`);
  }

  console.log("[enterprise-eval-pack] completed");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error("[enterprise-eval-pack] failed:", error);
  process.exit(1);
});
