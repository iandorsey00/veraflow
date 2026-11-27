import web from "../package.json";
import core from "../vendor/veraflow/revision.json";

export const version = web.version;
export const coreVersion = core.version;
export const repo = "https://github.com/iandorsey00/veraflow-web";
export const footer = `<span data-text="createdWith">Created with</span> <a href="${repo}" target="_blank" rel="noopener noreferrer">VeraFlow Web</a> v${version}<span data-text="createdEnd">.</span>`;
