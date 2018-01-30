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


getAccounts().then(([ from ]) => {
  const data = encodeFunctionCall({
    name: 'deposit',
    inputs: [{
      type: 'address',
      name: 'beneficiary'
    }]
  }, [ from ]);
  return sendTransaction({
    from,
    data,
    value: '1' + Array(19).join(0),
    to: require('./contract.json'),
    gas: 5000000,
    gasPrice: 10000000000
  });
}).then(getTransactionReceipt)
  .then(ln);

