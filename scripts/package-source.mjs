import { mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const changes = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
if (changes.status !== 0 || changes.stdout.trim()) throw new Error("Commit reviewed changes before packaging; the archive includes committed source only.");
mkdirSync("output", { recursive: true });
const output = path.resolve("output/deccan-kitchen-source.zip");
const archive = spawnSync("git", ["archive", "--format=zip", "--prefix=deccan-kitchen/", `--output=${output}`, "HEAD"], { stdio: "inherit" });
if (archive.status !== 0) process.exit(archive.status || 1);
console.log(`Saved ${output} (${(statSync(output).size / 1024 / 1024).toFixed(2)} MB). Dependencies, builds and ignored files are excluded.`);
