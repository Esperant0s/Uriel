// Settings that only show their mistakes when a release is cut or someone follows the README.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const [, owner, repo] = pkg.repository.url.match(/github\.com\/([^/]+)\/([^/.]+)/);

test('desktop releases upload to this repository: a repo that does not exist fails the upload', () => {
  const [target] = pkg.build.publish;
  assert.strictEqual(target.owner, owner);
  assert.strictEqual(target.repo, repo);
});

test('the README goes into the folder that its clone command creates', () => {
  const readme = read('README.md');
  const [, cloned] = readme.match(/git clone \S+\/([^/\s]+?)\.git/);
  assert.match(readme, new RegExp(`^cd ${cloned}$`, 'm'));
});

test('phone controls are big enough for a finger', () => {
  const css = read('mobile/mobile.css');
  assert.match(css, /\.search-clear-btn \{ width: 36px !important; height: 36px !important; \}/);
  assert.match(css, /:is\(\.theme-mode-btn, \.fps-cap-btn\) \{ min-height: 36px; \}/);
});
