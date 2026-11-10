// Lets Node load the phone layer's TypeScript (mobile/**/*.ts) in the tests: require('../tools/ts-require') first.
// Each file is compiled as it is loaded, by esbuild, the compiler mobile/build.mjs bundles the phone app with, so
// a test runs the same code the app does. Types are not checked here: `npm run typecheck` does that.
'use strict';

const fs = require('fs');
const Module = require('module');
const { transformSync } = require('esbuild');

Module._extensions['.ts'] = (module, filename) => {
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    loader: 'ts', format: 'cjs', target: 'node20', sourcefile: filename, sourcemap: 'inline',
  });
  module._compile(code, filename);
};

// require('./song-files') finds song-files.ts, as it does in the bundle
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  try {
    return resolveFilename.call(this, request, parent, ...rest);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND' || !/^\.{1,2}\//.test(request) || /\.[cm]?[jt]s$/.test(request)) throw e;
    return resolveFilename.call(this, `${request}.ts`, parent, ...rest);
  }
};
