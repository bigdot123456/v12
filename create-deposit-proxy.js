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
  data,
  to: require('./contract.json'),
  gas: 5000000,
  gasPrice: 10000000000
})).then(getTransactionReceipt)
  .then(ln)
  .then((receipt) => decodeLog([{
    type: 'address',
    name: 'beneficiary'
  }, {
    type: 'address',
    name: 'proxyAddress'
  }], receipt.logs[0].data, [ receipt.logs[0].topics[0] ]))
  .then(ln);

