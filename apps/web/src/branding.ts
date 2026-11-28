import web from "../package.json";
import core from "../../../package.json";

export const version = web.version;
export const coreVersion = core.version;
export const repo = "https://github.com/iandorsey00/veraflow";
export const webHome = `${repo}/tree/main/apps/web`;
export const footer = `<span data-text="createdWith">Created with</span> <a href="${webHome}" target="_blank" rel="noopener noreferrer">VeraFlow Web</a> v${version}<span data-text="createdEnd">.</span>`;
