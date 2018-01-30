'use strict';

const fs = require('fs-extra');
const {
  bindKey,
  partialRight
} = require('lodash');
const readFile = partialRight(bindKey(fs, 'readFile'), 'utf8');
const {
  sendTransaction,
  encodeFunctionCall,
  encodeParameters,
  getTransactionReceipt,
  call,
  getAccounts,
  decodeLog
} = require('./eth');
const {
  ln,
  addHexPrefix
} = require('./util');
const Web3 = require('web3');
const web3 = new Web3();
const { BN, toDecimal, toBN } = web3.utils;

getAccounts().then(([ from ]) => {
  const data = encodeFunctionCall({
    name: 'tokens',
    inputs: [{
      name: 'token',
      type: 'address'
    }, {
      name: 'user',
      type: 'address'
    }]
  }, ['0x' + Array(41).join(0), from ])
  return call({
    to: require('./contract'),
    data
  });
}).then(ln)
  .then(toBN)
  .then((v) => v.toString())
  .then(ln);
