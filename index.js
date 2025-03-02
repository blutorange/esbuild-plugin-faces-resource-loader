/** @import { BuildOptions, OnResolveArgs, Plugin } from "esbuild"; */
/** @import { PluginConfig } from "./internal.js"; */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL, fileURLToPath, URL } from "node:url";

/** @type {Promise<void>} */
let queue = Promise.resolve();

/**
 * Queues a task to be executed after all previously queued tasks have
 * finished (either successfully or with an error).
 * @param {() => Promise<void>} task New task to queue.
 * @returns {Promise<void>} Promise that resolves when the task has been
 * executed.
 */
function queueTask(task) {
    queue = queue.then(async () => {
        try {
            await task();
        } catch (e) {
            console.error(e);
        }
    });
    return queue;
}

/**
 * @typedef {Object} FacesResourceLoaderPluginOptions Options for the Faces
 * resource loader esbuild plugin.
 * @property {readonly string[]} extensions File extensions of resources to
 * which the plugin should apply, without the leading period (`.`).
 * @property {string} inputDir Directory for input files. Used find which sub
 * folders to create when copying files to the output directory. This is usually
 * the root of the resources in your source directory. For example,
 * `src/main/frontend/src`. Relative paths are resolved against the [esbuild
 * working directory](https://esbuild.github.io/api/#working-directory).
 * @property {string} outputDir Directory for output files. Used to find which
 * sub folders to create when copying files to the output directory. This is the
 * root of the resources  in your target directory. For example,
 * `target/generated-resources/META-INF/resources/library`. Relative paths are
 * resolved against the
 * [esbuild working directory](https://esbuild.github.io/api/#working-directory)
 * @property {string} resourceBase Base directory of the webapp resources, used
 * to create the resource expression. For example,
 * `target/generated-resources/META-INF/resources`. Relative paths are resolved
 * against the
 * [esbuild working directory](https://esbuild.github.io/api/#working-directory)
 * @property {boolean} useLibrary  Whether to use the library name in the
 * resource expression. For example, when set to `true`, it might generate
 * `#{resource['library:file/path.png']}`. When set to `false`, it might
 * generate `#{resource['library/file/path.png']}`.
 * @property {string} [npmOutputDir] Alternative output directory when a file is
 * from an NPM modules. See `outputDir` for more details. Defaults to
 * `outputDir`.
 * @property {string} [npmPrefix] Prefix for files from NPM modules.
 * When given, this prefix is added before the output file path, after
 * the `npmOutputDir`. Defaults to `vendor`. Set to empty string to disable.
 * @property {boolean} [quiet] Suppresses any logging output.
 */
undefined;

const namespace = "faces-resource-loader-plugin";

/**
 * Appends the suffix to the string if it is not already present.
 * @param {string} str String to which the suffix should be appended.
 * @param {string} suffix Suffix to append.
 * @returns {string} String with the suffix appended.
 */
function appendIfMissing(str, suffix) {
    return str.endsWith(suffix) ? str : str + suffix;
}

/**
 * Returns all parent directories of the given directory.
 * @param {string} dir Directory to process.
 * @returns {string[]} Parent directories, starting from the root.
 */
function parents(dir) {
    /** @type {string[]} */
    const result = [];
    let current = dir;
    while (current !== path.dirname(current)) {
        current = path.dirname(current);
        result.push(current);
    }
    return result.reverse();
}

/**
 * Pre-computes some data that is the same for every invocation of the build hooks. 
 * @param {BuildOptions} buildOptions 
 * @param {FacesResourceLoaderPluginOptions} pluginOptions
 * @returns {PluginConfig}
 */
function createConfig(buildOptions, pluginOptions) {
    const cwd = buildOptions.absWorkingDir ?? process.cwd();
    const absInputDir = path.resolve(cwd, pluginOptions.inputDir);
    const absOutputDir = path.resolve(cwd, pluginOptions.outputDir);
    const absResourceBase = path.resolve(cwd, pluginOptions.resourceBase);
    const absNpmOutputDir = pluginOptions.npmOutputDir && pluginOptions.npmOutputDir.length > 0
        ? path.resolve(cwd, pluginOptions.npmOutputDir)
        : absOutputDir;
    return {
        cwd,
        absInputDir,
        absOutputDir,
        absNpmOutputDir,
        absResourceBase,
        quiet: pluginOptions.quiet ?? false,
        npmPrefix: pluginOptions.npmPrefix ?? "vendor",
        useLibrary: pluginOptions.useLibrary,
    };
}

/**
 * Resolves the file to copy to the output directory; and
 * returns the path of the input and the target file.
 * @param {OnResolveArgs} resolveArgs
 * @param {PluginConfig} config 
 * @returns {Promise<{sourceUrl: URL, sourceFile: string; targetFile: string}>}
 */
async function resolveImportFileAndTarget(resolveArgs, config) {
    // The resolveArgs.path is a URL and may contain query params or fragments. 
    const baseUrl = pathToFileURL(appendIfMissing(resolveArgs.resolveDir, "/"));
    const sourceUrl = new URL(resolveArgs.path, baseUrl);
    const sourceFile = fileURLToPath(sourceUrl);

    /** @type {string} */
    let targetFile;

    // NPM uses a folder layout where one node_modules folder can contain
    // another node_modules folder.
    const lastNodeModules = Math.max(
        sourceFile.lastIndexOf("/node_modules/"),
        sourceFile.lastIndexOf("\\node_modules/"),
        sourceFile.lastIndexOf("/node_modules\\"),
        sourceFile.lastIndexOf("\\node_modules\\"),
    );

    if (lastNodeModules >= 0) {
        const nodePath = sourceFile.substring(lastNodeModules + "/node_modules/".length);
        const targetSegments = [config.absNpmOutputDir];
        if (config.npmPrefix.length > 0) {
            targetSegments.push(config.npmPrefix);
        }
        targetSegments.push(nodePath);
        targetFile = path.join(...targetSegments);
    } else {
        const relativeSourceFile = path.relative(config.absInputDir, sourceFile);
        targetFile = path.join(config.absOutputDir, relativeSourceFile);
    }

    return { sourceUrl, sourceFile, targetFile };
}

/**
 * Construct a Faces resource expression for the given file, e.g. `#{resource['library:file/path.txt']}`.
 * @param {string} file Absolute path of the file.
 * @param {URL} url The original URL of the file.
 * @param {PluginConfig} config Plugin configuration.
 */
function createFacesResourceExpression(file, url, config) {
    const fileParents = parents(file);
    if (!fileParents.includes(config.absResourceBase)) {
        throw new Error("File is not in the resource base.");
    }
    const relativePath = path.relative(config.absResourceBase, file);
    // Windows uses \, *nix /.
    const parts = relativePath.split(/[\\/]/);
    const params = `${url.search}${url.hash}`;
    if (config.useLibrary && parts.length > 1) {
        const [library, ...pathParts] = parts;
        return `#{resource['${library}:${pathParts.join("/")}']}${params}`;
    }
    return `#{resource['${parts.join("/")}']}${params}`;
}

/**
 * Plugin for esbuild that modifies the URL of imported resources in CSS files
 * to Faces resource expressions.
 * 
 * esbuild plugin for Faces resources. Jakarta Faces uses a custom resource loading
 * mechanism via the Faces servlet. When a CSS file wishes to reference e.g. an image
 * or font, it must use a special EL expression to refer to the resource, e.g.
 * `#{resource['library:file/path.txt']}`.
 * 
 * This plugin adjust the URL of referenced resources accordingly. This allows authors
 * to use normal relative paths in CSS files, such as `url(../images/image.png)`, and
 * have them automatically adjusted to the Faces resource expression during build time. 
 * 
 * Usage:
 * 
 * ```js
 * import { facesResourceLoaderPlugin } from "@xenorange/esbuild-plugin-faces-resource-loader";
 * esbuild.build({
 *     entryPoints: ["src/index.js"],
 *     bundle: true,
 *     // ...your other settings...
 *     plugins: [
 *         facesResourceLoaderPlugin({
 *             // Resources to which the plugin should apply 
 *             extensions: ["png", "gif", "jpg", "jpeg", "svg", "woff", "woff2", "ttf", "eot"],
 * 
 *             // Directory for input and output files. Used to construct the relative path
 *             // when copying files to the output directory.
 *             inputDir: "src/main/frontend/src",
 *             outputDir: "target/generated-resources/META-INF/resources/library",
 * 
 *             // Base directory of the webapp resources, used to create the resource expression.
 *             resourceBase: "target/generated-resources/META-INF/resources",
 * 
 *             // Whether to use the library name in the resource expression.
 *             // true:  #{resource['library:file/path.txt']}
 *             // false: #{resource['library/file/path.txt']}
 *             useLibrary: true,
 *         }),
 *     ],
 * });
 * ```
 *
 * @param {FacesResourceLoaderPluginOptions} options Options for adjusting this plugin.
 * @returns {Plugin} A new plugin that copies resources to the output directory and
 * adjusts the URLs in CSS files to Faces resource expressions.
 */
export function facesResourceLoaderPlugin(options) {
    const filter = new RegExp(`\\.(${options.extensions.join('|')})([#\?]+.*)?$`);

    return {
        name: namespace,
        setup: build => {
            const config = createConfig(build.initialOptions, options);

            /** @type {Map<string, string>} */
            const filesToCopy = new Map();

            build.onResolve(
                { filter },
                async args => {
                    if (args.namespace !== "file") {
                        // Faces resource loader plugin only supports resources from files
                        return undefined;
                    }
                    const importerExtension = path.extname(args.importer);
                    if (importerExtension !== ".css") {
                        // Faces resource loader plugin only supports resources imported from CSS files
                        return undefined;
                    }
                    // Only store resources to copy, and do the copy at the end.
                    // Otherwise, we might copy resources multiple times and simultaneously,
                    // which is bad in general and may also fail in Windows when it locks the target file.
                    const { sourceUrl, sourceFile, targetFile } = await resolveImportFileAndTarget(args, config);
                    filesToCopy.set(sourceFile, targetFile);
                    const facesResourceExpression = createFacesResourceExpression(targetFile, sourceUrl, config);
                        return {
                        external: true,
                        namespace,
                        path: facesResourceExpression,
                    };
                },
            );

            // Copy files at the end, to prevent copying the same file multiple times
            build.onEnd(async () => {
                await queueTask(async () => {
                    for (const [sourceFile, targetFile] of filesToCopy.entries()) {
                        if (!config.quiet) {
                            const relativeSourceFile = path.relative(config.absInputDir, sourceFile);
                            const relativeTargetFile = path.relative(config.absOutputDir, targetFile);
                            console.log(`Copying <${relativeSourceFile}> to <${relativeTargetFile}>`);
                        }
                        await fs.mkdir(path.dirname(targetFile), { recursive: true });
                        await fs.copyFile(sourceFile, targetFile);
                    }
                });
            });
        },
    };
};
