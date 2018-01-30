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
  getAccounts,
  decodeLog
} = require('./eth');
const {
  ln,
  addHexPrefix
} = require('./util');

const data = encodeFunctionCall({
  name: 'createDepositProxy',
  inputs: []
}, []);

getAccounts().then(([ from ]) => sendTransaction({
  from,
  to: require('./deposit-proxy.json'),
  value: '1' + Array(19).join(0),
  gas: 5000000,
  gasPrice: 10000000000
})).then(getTransactionReceipt)
  .then(ln)
