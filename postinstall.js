#!/usr/bin/env node

/*
  When installing the NPM module, submodules are not initialized automatically.
 */

var runsync = require("runsync");

// TODO: Should be replaced with child_process.execFileSync once Meteor moves to node.js 0.12.
runsync.execFile('git', ['init'], {stdio: 'inherit'});
runsync.execFile('./git-submodule.sh', {stdio: 'inherit'});
runsync.execFile('git', ['submodule', 'sync'], {stdio: 'inherit'});
runsync.execFile('git', ['submodule', 'update', '--init', '--recursive'], {stdio: 'inherit'});

/*
  Install a dependency kit.
 */

// Output of this command is potentially huge, so we do not print it out.
var output = runsync.execFile('./meteor/meteor', ['--get-ready'], {stdio: 'ignore'});
