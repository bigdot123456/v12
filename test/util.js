'use strict';

const util = require('util');
const ln = (v) => ((console.log(util.inspect(v, {
  colors: true,
  depth: 100
}))), v);
const BN = require('bignumber.js');
const fs = require('fs-extra');
const {
  partialRight,
  bindKey
} = require('lodash');

const readFileAsUtf8 = partialRight(bindKey(fs, 'readFile'), 'utf8');

const ethUtil = require('ethereumjs-util');

const {
  addHexPrefix,
  ecsign
} = [
  'addHexPrefix',
  'ecsign'
].reduce((r, v) => {
  r[v] = bindKey(ethUtil, v);
  return r;
}, {});

const toBN = (n) => new BN(n);


Object.assign(module.exports, {
  ln,
  addHexPrefix,
  toBN,
  readFileAsUtf8,
  ecsign
});
