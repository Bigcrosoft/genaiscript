import packageJson from "../package.json"

/**
 * The current version of the core package.
 */
export const CORE_VERSION = packageJson.version
export const VSCODE_CLI_VERSION = CORE_VERSION

/**
 * GitHub repository URL.
 */
export const GITHUB_REPO = packageJson.repository.url
export const PDFJS_DIST_VERSION = packageJson.optionalDependencies["pdfjs-dist"]
export const RIPGREP_DIST_VERSION =
    packageJson.optionalDependencies["@lvce-editor/ripgrep"]
