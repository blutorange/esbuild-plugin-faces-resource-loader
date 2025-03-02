# 1.1.2

* fix: Fix potential issue when running multiple esbuild tasks asynchronously
  that access the same resource. Ensure that when copying files, all file copy
  operations are run sequentially.

# 1.1.1

* fix: allow `?` (URL query) after extension, not just `#` (URL fragment).

# 1.1.0

* feat: Support files from NPM modules, e.g. when you `@import "primeicons/primeicons"`
  in your CSS file. 

# 1.0.0

* Initial release.