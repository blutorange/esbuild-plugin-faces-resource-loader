[![npm version](https://img.shields.io/npm/v/@xenorange/esbuild-plugin-faces-resource-loader)](https://www.npmjs.com/package/@xenorange/esbuild-plugin-faces-resource-loader) [![build status](https://github.com/blutorange/esbuild-plugin-faces-resource-loader/actions/workflows/node.js.yml/badge.svg)](https://github.com/blutorange/esbuild-plugin-faces-resource-loader/actions)

[esbuild](https://esbuild.github.io/) plugin for Faces (formerly JSF) resources,
intended only for CSS files.


Writes resources to an external directory, and replaces the URL with a Faces
resource expression.

# Motivation

[Jakarta Faces](https://en.wikipedia.org/wiki/Jakarta_Faces) is a server-side
web framework. It uses a custom resource loading mechanism that isn't compatible
with the web standard default. The web standard is to just treat URL paths as
folders, so that e.g. a CSS file can reference a PNG file via a relative path.

The Faces resource loader uses URL params and a custom extension, so that relative
URLs are not really possible. For example, a CSS and PNG file might have the
following URLs:

> https://www.example.com/webapp/javax.faces.resource/path/to/styles/style.css.xhtml?ln=my-lib&v=14.0.6-SNAPSHOT
>
> https://www.example.com/webapp/javax.faces.resource/path/to/images/image.png.xhtml?ln=my-lib&v=14.0.6-SNAPSHOT

Now in your CSS file, you'd have to use:

```css
* {
  background-image: url("../images/image.png.xhtml?ln=my-lib&v=14.0.6-SNAPSHOT");
}
```

That's not ideal, because (1) you now have to remember to update the version 
every time you make a new release, and (2) this kind of relative link won't work
with esbuild and other tools such as linters that expect the URL path to
correspond to the file system path.

Jakarta Faces offers a solution to the first issue, by using resource expressions:

```css
* {
  background-image: url("#{resource['my-lib:images/image.png']}");
}
```

But that's even less compatible with frontend tools. What you'd really want to
write in your source CSS file is:

```css
* {
  background-image: url("../images/image.png");
}
```

Where the URL is resolved against the path of the CSS file.

This esbuild plugin transforms `"../images/image.png"` to `"#{resource['my-lib:images/image.png']}"`

# Usage

See also [test/test.js](test/test.js) and [test/expected](test/expected) for an example.

```js
import { facesResourceLoaderPlugin } from "@xenorange/esbuild-plugin-faces-resource-loader";

await esbuild.build({
  entryPoints: ["src/index.js"],
  bundle: true,
  // ...your other settings...
  plugins: [
    facesResourceLoaderPlugin({
      extensions: ["png", "jpg", "jpeg", "gif", "svg", "woff", "woff2", "ttf", "eot"],
      inputDir: "src/main/frontend/src",
      outputDir: "target/generated-resources/META-INF/resources/library",
      resourceBase: "target/generated-resources/META-INF/resources",
      useLibrary: true,
    }),
  ],
});
```

Options are as follows. Relative paths are resolved against the
[esbuild working directory](https://esbuild.github.io/api/#working-directory).

* `extensions` - File extensions of resources to which the plugin should apply,
without the leading period (`.`).
* `inputDir` - Directory for input files. Used find which sub folders to create
when copying files to the output directory. This is usually the root of the
resources in your source directory. For example, `src/main/frontend/src`.
* `outputDir` - Directory for output files. Used to find which sub folders to
create when copying files to the output directory. This is the root of the
resources  in your target directory. For example,
`target/generated-resources/META-INF/resources/library`.
* `resourceBase` - Base directory of the webapp resources, used to create the
resource expression. For example,
`target/generated-resources/META-INF/resources`.
* `useLibrary` - Whether to use the library name in the resource expression. For
example, when set to `true`, it might generate
`#{resource['library:file/path.png']}`. When set to `false`, it might generate
`#{resource['library/file/path.png']}`.
* `npmOutputDir` - (Optional) Allows you to use a different value for `outputDir`
  when the current file is from an NPM module.
* `npmPrefix` - (Optional) Prepends this prefix to the relative path
  of the output file (before the `outputDir`).
* -`quiet` - (Optional) Suppresses any logging output.

# NPM modules

Since version 1.1.0, this plugin also supports files from NPM modules. For example,
let's you have a CSS file with:

```css
@import url("primeicons/primeicons.css");
```

Normally, this plugin computes the output path from the path of
the input file, relative to the base input folder.

The file `primeicons.css` might be located somewhere else, completely outside
your source folder (e.g. in a ZIP file within some cache folder). This raises
the question where the output file should be placed.

The default behavior is to take the path of the file within the NPM module
(e.g. `primeicons/fonts/primeicons.woff2`), prepend `vendor/` and resolve that
relative to the base output directory.

There are a few options to adjust this process, see above (`npmOutputDir` and
`npmPrefix`).

Note: Currently the plugin checks for the last index of `/node_modules/` to
check for an NPM module. That works fine with NPM and Yarn PnP. If it fails with
your favorite package manager, consider opening an issue.

# Release

Check `CHANGELOG.md` and `package.json` for the version. Then:

```sh
yarn npm publish --access public
git tag -a x.y.z
git push origin x.y.z
```

Then create a github release and set version to next snapshot.
