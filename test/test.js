import { build } from "esbuild";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { facesResourceLoaderPlugin } from "../index.js";

console.log("Running IT tests with esbuild...");

const dirname = path.dirname(fileURLToPath(import.meta.url));

await fs.rm(path.join(dirname, "dist"), { force: true, recursive: true });

// Run esbuild, with useLibrary set to false and true

console.log("esbuild started");

await build({
	entryPoints: ["src/frontend/css/style.css", "src/frontend/js/script.js"],
	outdir: "./dist/lib/my-lib",
	absWorkingDir: dirname,
	bundle: true,
	loader: {
		".png": "base64",	
		".svg": "empty",
	},
	plugins: [
		facesResourceLoaderPlugin({
			extensions: ["png", "eot", "woff", "woff2", "ttf"],
			inputDir: "src/frontend",
			outputDir: "dist/lib/my-lib",
			resourceBase: "dist/lib",
			useLibrary: true,
			npmOutputDir: "dist/lib/my-lib/npm",
			npmPrefix: "vendor-custom",
		}),
	],
});

await build({
	entryPoints: ["src/frontend/css/style.css", "src/frontend/js/script.js"],
	outdir: "./dist/no-lib/my-lib",
	absWorkingDir: dirname,
	bundle: true,
	loader: {
		".png": "base64",	
		".svg": "empty",	
	},
	plugins: [
		facesResourceLoaderPlugin({
			extensions: ["png", "eot", "woff", "woff2", "ttf"],
			inputDir: "src/frontend",
			outputDir: "dist/no-lib/my-lib",
			resourceBase: "dist/no-lib",
			useLibrary: false,
			npmOutputDir: "dist/no-lib/my-lib/npm",
			npmPrefix: "vendor-custom",
		}),
	],
});

console.log("esbuild completed");

// Assert generated build output matches our expectations

const distDirFiles = await fs.readdir(path.join(dirname, "dist"), {
	recursive: true,
});
const expectedDirFiles = await fs.readdir(path.join(dirname, "expected"), {
	recursive: true,
});

const distFiles = (
	await Promise.all(
		distDirFiles.map(async (file) =>
			(await fs.stat(path.join(dirname, "dist", file))).isFile()
				? file
				: undefined,
		),
	)
)
	.filter((x) => x !== undefined)
	.sort();

const expectedFiles = (
	await Promise.all(
		expectedDirFiles.map(async (file) =>
			(await fs.stat(path.join(dirname, "expected", file))).isFile()
				? file
				: undefined,
		),
	)
)
	.filter((x) => x !== undefined)
	.sort();

if (distFiles.length !== expectedFiles.length) {
	throw new Error(
		`Expected ${expectedFiles.length} generated files, but got ${distFiles.length}`,
	);
}

for (let i = 0; i < expectedFiles.length; i += 1) {
	const file = expectedFiles[i];
	const isText = [".js", ".css"].includes(path.extname(file));

	const distFileContent = await fs.readFile(
		path.join(dirname, "dist", file),
		{ encoding: isText ? "utf8" : "base64" },
	);
	const expectedFileContent = await fs.readFile(
		path.join(dirname, "expected", file),
		{ encoding: isText ? "utf8" : "base64" },
	);

	const normalizedDistFileContent = normalizeTextContent(distFileContent);
	const normalizedExpectedFileContent = normalizeTextContent(expectedFileContent);

	if (normalizedDistFileContent !== normalizedExpectedFileContent) {
		throw new Error(
			`Expected file ${file} to have content: \n\n${expectedFileContent.substring(0, 300)}\n\nBut was:\n\n${distFileContent.substring(0, 300)}`,
		);
	}
}

console.log("IT tests successful");

/**
 * Normalize text file content, removes comments, whitespaces and newlines.
 * @param {string} content The content to normalize.
 * @returns {string} The normalized content.
 */
function normalizeTextContent(content) {
	return content.replace(/^\/\*.*\*\/$/gm, "").replace(/[\n\r\s]+/g, "").replace("\\", "/");
}