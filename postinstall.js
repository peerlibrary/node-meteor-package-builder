#!/usr/bin/env node

/*
  When installing the NPM module, submodules are not initialized automatically.
 */

var childProcess = require('child_process');

childProcess.execFileSync('git', ['init']);
childProcess.execFileSync('git', ['submodule', 'sync']);
childProcess.execFileSync('git', ['submodule', 'update', '--init', '--recursive']);

/*
   package-version-parser tries to load packages from ../../dev_bundle/lib/node_modules
   so we have to prepare a symlink to real node_modules directory.
 */

var fs = require('fs');
var path = require('path');

var meteorPath = require.resolve('./meteor/tools/main.js').split(path.sep);
meteorPath.pop(); // Removing "main.js".
meteorPath.pop(); // Removing "tools".
meteorPath = meteorPath.join(path.sep);

var tempPath = path.join(meteorPath, 'dev_bundle');
if (!fs.existsSync(tempPath)) {
  fs.mkdirSync(tempPath);
}
tempPath = path.join(meteorPath, 'dev_bundle', 'lib');
if (!fs.existsSync(tempPath)) {
  fs.mkdirSync(tempPath);
}

var modulesPath = require.resolve('underscore').split(path.sep);
modulesPath.pop(); // Removing "underscore.js".
modulesPath.pop(); // Removing "underscore".
modulesPath = modulesPath.join(path.sep);

tempPath = path.join(meteorPath, 'dev_bundle', 'lib', 'node_modules');
if (!fs.existsSync(tempPath)) {
  fs.symlinkSync(modulesPath, tempPath);
}
