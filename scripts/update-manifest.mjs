import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// Verify the actual bundles, including minisign's authenticated version comment,
// before they can become an update feed. Requires the official minisign CLI.
const directory = process.argv[2];
if (!directory) throw Error("Supply the release asset directory");
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const version = config.version;
const key = Buffer.from(config.plugins.updater.pubkey, "base64")
  .toString("utf8")
  .trim()
  .split(/\r?\n/)[1];
const targets = {
  "darwin-aarch64": `VeraFlow_v${version}_macos-arm64.app.tar.gz`,
  "darwin-x86_64": `VeraFlow_v${version}_macos-x64.app.tar.gz`,
  "windows-x86_64": `VeraFlow_v${version}_windows-x64-setup.exe`,
};
const platforms = {};
const temp = mkdtempSync(join(tmpdir(), "veraflow-signatures-"));
try {
  for (const [target, filename] of Object.entries(targets)) {
    const signature = readFileSync(
      join(directory, filename + ".sig"),
      "utf8",
    ).trim();
    const decoded = Buffer.from(signature, "base64").toString("utf8");
    const signatureFile = join(temp, target + ".minisig");
    writeFileSync(signatureFile, decoded);
    execFileSync(
      "minisign",
      ["-Vm", join(directory, filename), "-x", signatureFile, "-P", key],
      { stdio: "pipe" },
    );
    const comment = decoded.trim().split(/\r?\n/)[2];
    if (
      !comment?.startsWith("trusted comment: ") ||
      !comment.slice(17).split("\t").includes(`version:${version}`)
    )
      throw Error(`Signature version mismatch for ${target}`);
    platforms[target] = {
      signature,
      url: `https://github.com/iandorsey00/veraflow/releases/download/v${version}/${filename}`,
    };
  }
  // Fail if a platform bundle or signature is missing or extra files were collected.
  const expected = [
    ...Object.values(targets).flatMap((name) => [name, name + ".sig"]),
    `VeraFlow_v${version}_macos-arm64.zip`,
    `VeraFlow_v${version}_macos-x64.zip`,
  ];
  const actual = readdirSync(directory).filter((name) =>
    name.startsWith("VeraFlow_"),
  );
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort()))
    throw Error("Unexpected release asset set");
  const manifest = {
    version,
    notes: readFileSync("docs/binary-release-notes.md", "utf8"),
    platforms,
  };
  writeFileSync(
    join(directory, "latest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`Verified all three signed update bundles for ${version}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
