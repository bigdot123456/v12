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
  getAccounts
} = require('./eth');
const {
  ln,
  addHexPrefix
} = require('./util');

const payload = encodeParameters(['address'], ['0x034767f3c519f361c5ecf46ebfc08981c629d381']).substr(2);

readFile('./Exchange.bytecode')
  .then(JSON.parse)
  .then(addHexPrefix)
  .then((data) => {
    ln(data.length);
    return getAccounts().then(([ from ]) => sendTransaction({
      data: ln(data + payload),
      from,
      gas: 4000000000,
      gasPrice: 1
    }));
  })
  .then((tx) => getTransactionReceipt(tx))
  .then(ln)
  .catch((err) => console.log(err.stack));
