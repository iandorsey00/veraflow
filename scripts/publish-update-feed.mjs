import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const repo = process.env.GITHUB_REPOSITORY;
if (repo !== "iandorsey00/veraflow")
  throw Error("Unexpected update repository");
const api = (path, data) =>
  JSON.parse(
    execFileSync(
      "gh",
      ["api", path, ...(data ? ["--method", "PUT", "--input", "-"] : [])],
      { input: data && JSON.stringify(data), encoding: "utf8" },
    ),
  );
const content = readFileSync("release-assets/latest.json");
const manifest = JSON.parse(content);
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
if (manifest.version !== version) throw Error("Wrong feed version");
const release = api(`repos/${repo}/releases/tags/v${version}`);
if (release.draft) throw Error("Cannot advertise a draft release");
for (const platform of Object.values(manifest.platforms)) {
  if (
    !release.assets.some((asset) => asset.browser_download_url === platform.url)
  )
    throw Error("Update asset is not published");
}
// Create the feed branch only when GitHub reports it absent. Other API errors fail closed.
const branches = api(`repos/${repo}/branches?per_page=100`);
if (!branches.some((branch) => branch.name === "updates")) {
  execFileSync(
    "gh",
    ["api", `repos/${repo}/git/refs`, "--method", "POST", "--input", "-"],
    {
      input: JSON.stringify({
        ref: "refs/heads/updates",
        sha: process.env.GITHUB_SHA,
      }),
      stdio: ["pipe", "ignore", "inherit"],
    },
  );
}
const listing = api(`repos/${repo}/contents?ref=updates`);
let sha;
if (listing.some((file) => file.name === "latest.json")) {
  const previous = api(`repos/${repo}/contents/latest.json?ref=updates`);
  sha = previous.sha;
  const old = JSON.parse(
    Buffer.from(previous.content, "base64").toString("utf8"),
  );
  const numbers = (value) => {
    if (!/^\d+\.\d+\.\d+$/.test(value))
      throw Error("Unexpected version format");
    return value.split(".").map(Number);
  };
  const a = numbers(old.version),
    b = numbers(version);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) throw Error("Refusing to move update feed backwards");
    if (a[i] < b[i]) break;
  }
}
api(`repos/${repo}/contents/latest.json`, {
  branch: "updates",
  sha,
  message: `Publish verified update feed for v${version}`,
  content: content.toString("base64"),
});
console.log(`Update feed now advertises v${version}`);
