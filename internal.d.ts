/**
 * Configuration for the Faces resource loader esbuild plugin.
 */
export type PluginConfig = {
    absInputDir: string;
    absOutputDir: string;
    absNpmOutputDir: string;
    absResourceBase: string;
    cwd: string;
    quiet: boolean;
    npmPrefix: string;
    useLibrary: boolean;
};
