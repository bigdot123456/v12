'use strict';

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const { bindKey } = require('lodash');
const { promisify } = require('bluebird');

const {
  sendTransaction,
  getTransactionReceipt,
  isSyncing,
  getBalance,
  call,
  getTransactionCount,
  getBlock,
  getGasPrice,
  getAccounts
} = [
  'sendTransaction',
  'getTransactionReceipt',
  'isSyncing',
  'getBalance',
  'call',
  'getTransactionCount',
  'getBlock',
  'getGasPrice',
  'getAccounts'
].reduce((r, v) => {
  r[v] = promisify(bindKey(web3.eth, v));
  return r;
}, {});

const {
  encodeFunctionCall,
  decodeLog,
  encodeParameters
} = [
  'encodeFunctionCall',
  'decodeLog',
  'encodeParameters'
].reduce((r, v) => {
  r[v] = bindKey(web3.eth.abi, v);
  return r;
}, {});

Object.assign(module.exports, {
  sendTransaction,
  getBlock,
  getGasPrice,
  isSyncing,
  call,
  getTransactionCount,
  getBlock,
  getBalance,
  getAccounts,
  encodeParameters,
  getTransactionReceipt,
  encodeFunctionCall,
  decodeLog
});
