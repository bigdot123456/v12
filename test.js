'use strict';

const {
  hashPersonalMessage,
  toBuffer,
  bufferToHex
} = require('ethereumjs-util');
const {
  soliditySha3
} = require('web3-utils');

const raw = soliditySha3({
  t: 'uint256',
  v: 5
});

const salted = soliditySha3({
  t: 'string',
  v: '\x19Ethereum Signed Message:\n32'
}, {
  t: 'bytes32',
  v: raw
});

console.log(salted);
var utilSalted = bufferToHex(hashPersonalMessage(toBuffer(raw)));
console.log(utilSalted);
  
