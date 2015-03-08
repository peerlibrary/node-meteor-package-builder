#!/usr/bin/env node

/*
  When installing the NPM module, submodules are not initialized automatically.
 */

var runsync = require("runsync");

// TODO: Should be replaced with child_process.execFileSync once Meteor moves to node.js 0.12.
runsync.execFile('git', ['init'], {stdio: 'inherit'});
runsync.execFile('git', ['remote', 'add', 'origin', 'https://github.com/peerlibrary/node-meteor-package-builder.git'], {stdio: 'inherit'});
try {
  // This commands fails because it cannot merge (there are files it would have to override),
  // but we still need it for checkout later on to work as expected.
  runsync.execFile('git', ['pull', 'origin', 'master'], {stdio: 'inherit'});
}
catch (e) {}
// Merge from the pull failed, but we do not really care, because we want fails to be overridden. Override now.
runsync.execFile('git', ['checkout', '-f', 'master'], {stdio: 'inherit'});
runsync.execFile('git', ['submodule', 'sync'], {stdio: 'inherit'});
runsync.execFile('git', ['submodule', 'update', '--init', '--recursive'], {stdio: 'inherit'});

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
