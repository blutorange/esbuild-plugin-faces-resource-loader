/**
 * Configuration for the Faces resource loader esbuild plugin.
 */
export type PluginConfig = {
    absInputDir: string;
    absOutputDir: string;
    absResourceBase: string;
    cwd: string;
    useLibrary: boolean;
};
