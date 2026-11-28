import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compareVersions, isReleaseVersion } from "./versions";
import { repo, version } from "./branding";

export async function updateApp() {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const releases = `${repo}/releases?q=web-v`;
  const tagPrefix = "refs/tags/web-v";
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  let checkoutVersion: unknown;
  try {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    if (
      manifest.name !== "veraflow-web" ||
      git("rev-parse", "--show-prefix") !== "apps/web/"
    )
      throw new Error("Not a VeraFlow Web source checkout");
    checkoutVersion = manifest.version;
  } catch {
    throw new Error(
      `Run --update from a VeraFlow Web Git checkout, or download the latest release at ${releases}.`,
    );
  }
  if (!isReleaseVersion(checkoutVersion))
    throw new Error("The source checkout has an invalid version.");
  if (git("status", "--porcelain"))
    throw new Error("Commit or set aside your local changes before updating.");
  try {
    git("symbolic-ref", "--quiet", "HEAD");
  } catch {
    throw new Error(
      "Switch to your VeraFlow Web update branch before updating.",
    );
  }

  let tags: string;
  try {
    tags = git("ls-remote", "--refs", "--tags", "origin", `${tagPrefix}*`);
  } catch {
    throw new Error(
      `Could not check release tags on origin. Release downloads are at ${releases}.`,
    );
  }
  const newest = tags
    .split("\n")
    .map((line) => line.split("\t")[1])
    .filter((ref) => ref?.startsWith(tagPrefix))
    .map((ref) => ref.slice(tagPrefix.length))
    .filter(isReleaseVersion)
    .sort(compareVersions)
    .at(-1);
  const updateAvailable =
    newest !== undefined && compareVersions(newest, checkoutVersion) > 0;
  if (!updateAvailable && compareVersions(checkoutVersion, version) <= 0) {
    console.log(`VeraFlow Web v${version} is current.`);
    return;
  }
  if (updateAvailable) {
    try {
      git("fetch", "--no-tags", "origin", `${tagPrefix}${newest}`);
      const tagged = JSON.parse(git("show", "FETCH_HEAD:apps/web/package.json"));
      if (tagged.name !== "veraflow-web" || tagged.version !== newest)
        throw new Error("Release metadata does not match the tag");
      git("merge", "--ff-only", "FETCH_HEAD");
    } catch {
      throw new Error(
        `Could not fast-forward to web-v${newest}. Check the Git checkout before retrying.`,
      );
    }
  }
  for (const args of [["ci"], ["run", "build"]]) {
    const result =
      process.platform === "win32"
        ? spawnSync("cmd.exe", ["/d", "/c", "npm", ...args], {
            cwd,
            stdio: "inherit",
          })
        : spawnSync("npm", args, { cwd, stdio: "inherit" });
    if (result.status !== 0)
      throw new Error(
        `Could not run npm ${args.join(" ")}. Run --update again to retry the build.`,
      );
  }
  console.log(
    `Updated VeraFlow Web to v${updateAvailable ? newest : checkoutVersion}.`,
  );
}
