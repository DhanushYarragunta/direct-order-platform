import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// A project-owned cluster: never starts, stops, or resets a Homebrew/global database.
const root = resolve(".local"),
  data = resolve(root, "postgres"),
  marker = resolve(root, "database.json");
const bin = process.env.POSTGRES_BIN || "/opt/homebrew/opt/postgresql@16/bin";
function run(command, args, options = {}) {
  const result = spawnSync(resolve(bin, command), args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result.stdout;
}
try {
  if (process.argv[2] === "stop") {
    if (!existsSync(marker))
      throw new Error("No project-owned database exists.");
    run("pg_ctl", ["-D", data, "stop", "-m", "fast"]);
    console.log("Project database stopped.");
    process.exit(0);
  }
  if (!existsSync(marker)) {
    if (existsSync(".env") || existsSync(data))
      throw new Error(
        "An .env or database already exists. Keep it and configure DATABASE_URL manually; no files were overwritten.",
      );
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const password = randomBytes(24).toString("hex"),
      demoPassword = randomBytes(16).toString("hex");
    writeFileSync(resolve(root, "db-password"), password, { mode: 0o600 });
    run("initdb", [
      "-D",
      data,
      "-U",
      "deccan",
      "--auth=scram-sha-256",
      `--pwfile=${resolve(root, "db-password")}`,
      "--encoding=UTF8",
      "--locale=C",
    ]);
    writeFileSync(
      marker,
      JSON.stringify({ port: 55432, user: "deccan", database: "isocodelabs" }),
      { mode: 0o600 },
    );
    writeFileSync(
      ".env",
      `DATABASE_URL=postgresql://deccan:${password}@127.0.0.1:55432/isocodelabs\nAPP_ORIGIN=http://127.0.0.1:3000\nDEMO_MODE=true\nDEMO_PASSWORD=${demoPassword}\n`,
      { mode: 0o600 },
    );
  }
  const config = JSON.parse(readFileSync(marker, "utf8"));
  const status = spawnSync(resolve(bin, "pg_ctl"), ["-D", data, "status"], {
    encoding: "utf8",
  });
  if (status.status !== 0)
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      resolve(root, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${config.port} -k ''`,
      "-w",
      "start",
    ]);
  const env = {
    ...process.env,
    PGPASSWORD: readFileSync(resolve(root, "db-password"), "utf8"),
  };
  const args = [
    "-h",
    "127.0.0.1",
    "-p",
    String(config.port),
    "-U",
    config.user,
  ];
  const found = run(
    "psql",
    [
      ...args,
      "-d",
      "postgres",
      "-tAc",
      "SELECT 1 FROM pg_database WHERE datname='isocodelabs'",
    ],
    { env },
  );
  if (!found.trim()) run("createdb", [...args, config.database], { env });
  console.log(
    "Project PostgreSQL is ready on 127.0.0.1:55432. Credentials are in the ignored .env file.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
