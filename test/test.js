'use strict';

const expect = require('chai').expect;
const eth = require('./eth');
const { join } = require('path');
const util = require('./util');
const { generate } = require('ethereumjs-wallet');
const {
  unitMap,
  soliditySha3
} = require('web3-utils');
const {
  property,
  mapValues,
  method,
  partial,
  bindKey
} = require('lodash');
const {
  toBuffer,
  hashPersonalMessage,
  ecsign,
  bufferToHex
} = require('ethereumjs-util');
const curryN = require('lodash/fp/curryN');
const { readFileSync } = require('fs');

const exchangeInterface = JSON.parse(readFileSync(join(__dirname, '..', 'Exchange.interface')));

const getContractBalance = curryN(3, (contract, user, token) => eth.call({
  to: contract,
  data: eth.encodeFunctionCall({
    name: 'tokens',
    inputs: [{
      name: 'token',
      type: 'address'
    }, {
      name: 'user',
      type: 'address'
    }]
  }, [ token, user ])
}));

const wallet = generate();

const ETH_ADDRESS = '0x' + Array(41).join(0);

describe('IDEX contract v2', () => {
  let from, gas, gasPrice, exchangeContract, accounts;
  let getCurrentContractBalance = () => Promise.reject(Error('Not initialized'));
  before(() => eth.getAccounts()
    .then((_accounts) => (accounts = _accounts))
    .then(([ _from ]) => (from = _from))
    .then(() => eth.getGasPrice())
    .then((_gasPrice) => (gasPrice = _gasPrice))
    .then(() => eth.getBlock('pending'))
    .then(property('gasLimit'))
    .then((_gas) => (gas = _gas))
    .then(() => eth.sendTransaction({
      to: wallet.getAddressString(),
      from,
      value: unitMap.ether
    }))
    .then(() => util.readFileAsUtf8(join(__dirname, '..', 'Exchange.bytecode')))
    .then(bindKey(JSON, 'parse'))
    .then(util.addHexPrefix)
    .then((data) => eth.sendTransaction({
      from,
      gas,
      gasPrice,
      data
    }))
    .then(eth.getTransactionReceipt)
    .then(property('contractAddress'))
    .then((contractAddress) => (exchangeContract = contractAddress))
    .then((contractAddress) => (getCurrentContractBalance = getContractBalance(contractAddress))));

  describe('deposit proxy', () => {
    let proxy;
    before(() => eth.sendTransaction({
      to: exchangeContract,
      gas,
      gasPrice,
      from: accounts[1],
      data: eth.encodeFunctionCall({
        name: 'createDepositProxy',
        inputs: []
      }, [])
    }).then(eth.getTransactionReceipt)
      .then((receipt) => eth.decodeLog([{
        type: 'address',
        name: 'beneficiary'
      }, {
        type: 'address',
        name: 'proxyAddress'
      }], receipt.logs[0].data, [ receipt.logs[0].topics[0] ]))
      .then(property('proxyAddress'))
      .then((_proxy) => (proxy = _proxy)));

    it('should forward ether deposits', () => eth.sendTransaction({
        to: proxy,
        from,
        gas,
        gasPrice,
        value: unitMap.ether
      }).then(() => eth.call({
        to: exchangeContract,
        data: eth.encodeFunctionCall({
          name: 'tokens',
          inputs: [{
            name: 'token',
            type: 'address'
          }, {
            name: 'user',
            type: 'address'
          }]
        }, [ ETH_ADDRESS, accounts[1] ])
      }).then(util.toBN)
        .then(method('toPrecision'))
        .then((result) => expect(result).to.eql(unitMap.ether))));
  });
  
  describe('transfer fn', () => {
    it('should transfer funds to another wallet', () => eth.sendTransaction({
        from: accounts[1],
        to: exchangeContract,
        gasPrice,
        gas,
        data: eth.encodeFunctionCall({
          name: 'deposit',
          inputs: [{
            name: 'target',
            type: 'address'
          }]
        }, [ wallet.getAddressString() ]),
        value: unitMap.ether
      }).then(() => {
        const nonce = 1;
        const token = ETH_ADDRESS;
        const amount = unitMap.ether;
        const user = wallet.getAddressString();
        const target = accounts[2];
        const raw = soliditySha3(...[{
          t: 'address',
          v: exchangeContract
        }, {
          t: 'address',
          v: token
        }, {
          t: 'uint256',
          v: amount
        }, {
          t: 'address',
          v: user
        }, {
          t: 'address',
          v: target
        }, {
          t: 'uint256',
          v: nonce
        }]);
        const transferSalted = soliditySha3(...[{
          t: 'string',
          v: '\x19IDEX Signed Transfer:\n32'
        }, {
          t: 'bytes32',
          v: raw
        }]);
        const salted = bufferToHex(hashPersonalMessage(toBuffer(transferSalted)));
        const {
          v,
          r,
          s
        } = mapValues(ecsign(toBuffer(salted), wallet.getPrivateKey()), (v, k) => k === 'v' ? v : bufferToHex(v));
        return eth.sendTransaction({
          to: exchangeContract,
          from,
          gas,
          gasPrice,
          data: eth.encodeFunctionCall({
            name: 'transfer',
            inputs: [{
              name: 'token',
              type: 'address'
            }, {
              name: 'amount',
              type: 'uint256'
            }, {
              name: 'user',
              type: 'address'
            }, {
              name: 'target',
              type: 'address'
            }, {
              name: 'nonce',
              type: 'uint256'
            }, {
              name: 'v',
              type: 'uint8'
            }, {
              name: 'r',
              type: 'bytes32'
            }, {
              name: 's',
              type: 'bytes32'
            }, {
              name: 'feeTransfer',
              type: 'uint256'
            }]
          }, [
            token,
            amount,
            user,
            target,
            nonce,
            v,
            r,
            s,
            '1' + Array(18).join(0)
          ])
        });
      }).then(() => eth.call({
        to: exchangeContract,
        data: eth.encodeFunctionCall({
          name: 'tokens',
          inputs: [{
            name: 'token',
            type: 'address'
          }, {
            name: 'user',
            type: 'address'
          }]
        }, [ ETH_ADDRESS, accounts[2] ])
      }).then(util.toBN).then(method('toPrecision')))
        .then((result) => expect(result).to.eql('9' + Array(18).join(0))));
  });
  describe('withdraw fn', () => {
    before(() => getCurrentContractBalance(wallet.getAddressString())(ETH_ADDRESS)
      .then(util.toBN)
      .then(method('toPrecision'))
      .then((result) => expect(result).to.eql('0')));
    it('should cap regular withdrawals at 10% fee', () => eth.sendTransaction({
      to: exchangeContract,
      from,
      gasPrice,
      gas,
      data: eth.encodeFunctionCall({
        name: 'deposit',
        inputs: [{
          name: 'beneficiary',
          type: 'address'
        }]
      }, [ wallet.getAddressString() ]),
      value: unitMap.ether
    }).then(() => Promise.all([
      eth.getBalance(accounts[3]),
      getCurrentContractBalance(ETH_ADDRESS)(ETH_ADDRESS)
    ]))
    .then(([ previousBalance, previousFeeBalance ]) => {
      const token = ETH_ADDRESS;
      const amount = unitMap.ether;
      const user = wallet.getAddressString();
      const target = accounts[3];
      const authorizeArbitraryFee = false;
      const nonce = 1;
      const feeWithdrawal = util.toBN(unitMap.ether).dividedToIntegerBy(2).toPrecision();
      const {
        v,
        r,
        s
      } = mapValues(ecsign(hashPersonalMessage(toBuffer(soliditySha3(...[{
        t: 'address',
        v: exchangeContract
      }, {
        t: 'address',
        v: token
      }, {
        t: 'uint256',
        v: amount
      }, {
        t: 'address',
        v: user
      }, {
        t: 'address',
        v: target
      }, {
        t: 'bool',
        v: authorizeArbitraryFee
      }, {
        t: 'uint256',
        v: nonce
      }]))), wallet.getPrivateKey()), (v, k) => k === 'v' ? v : bufferToHex(v));
      return eth.sendTransaction({
        from,
        gas,
        gasPrice,
        to: exchangeContract,
        data: eth.encodeFunctionCall(exchangeInterface.find(({ name } ) => name === 'adminWithdraw'), [
          token,
          amount,
          user,
          target,
          authorizeArbitraryFee,
          nonce,
          v,
          r,
          s,
          feeWithdrawal
        ])
      }).then(() => getCurrentContractBalance(ETH_ADDRESS)(ETH_ADDRESS))
        .then((balance) => expect(util.toBN(balance).minus(util.toBN(previousFeeBalance)).toPrecision()).to.eql(util.toBN('100').times(unitMap.finney).toPrecision()))
        .then(() => eth.getBalance(accounts[3]))
        .then((balance) => expect(util.toBN(balance).minus(previousBalance).toPrecision()).to.eql(util.toBN('900').times(unitMap.finney).toPrecision()));
    }));
    it('should allow an uncapped fee for withdrawals', () => eth.sendTransaction({
      to: exchangeContract,
      from,
      gasPrice,
      gas,
      data: eth.encodeFunctionCall({
        name: 'deposit',
        inputs: [{
          name: 'beneficiary',
          type: 'address'
        }]
      }, [ wallet.getAddressString() ]),
      value: unitMap.ether
    }).then(() => Promise.all([
      eth.getBalance(accounts[3]),
      getCurrentContractBalance(ETH_ADDRESS)(ETH_ADDRESS)
    ]))
    .then(([ previousBalance, previousFeeBalance ]) => {
      const token = ETH_ADDRESS;
      const amount = unitMap.ether;
      const user = wallet.getAddressString();
      const target = accounts[3];
      const authorizeArbitraryFee = true;
      const nonce = 1;
      const feeWithdrawal = util.toBN(unitMap.ether).dividedToIntegerBy(2).toPrecision();
      const {
        v,
        r,
        s
      } = mapValues(ecsign(hashPersonalMessage(toBuffer(soliditySha3(...[{
        t: 'address',
        v: exchangeContract
      }, {
        t: 'address',
        v: token
      }, {
        t: 'uint256',
        v: amount
      }, {
        t: 'address',
        v: user
      }, {
        t: 'address',
        v: target
      }, {
        t: 'bool',
        v: authorizeArbitraryFee
      }, {
        t: 'uint256',
        v: nonce
      }]))), wallet.getPrivateKey()), (v, k) => k === 'v' ? v : bufferToHex(v));
      return eth.sendTransaction({
        from,
        gas,
        gasPrice,
        to: exchangeContract,
        data: eth.encodeFunctionCall(exchangeInterface.find(({ name } ) => name === 'adminWithdraw'), [
          token,
          amount,
          user,
          target,
          authorizeArbitraryFee,
          nonce,
          v,
          r,
          s,
          feeWithdrawal
        ])
      }).then(() => getCurrentContractBalance(ETH_ADDRESS)(ETH_ADDRESS))
        .then((balance) => expect(util.toBN(balance).minus(util.toBN(previousFeeBalance)).toPrecision()).to.eql(util.toBN('500').times(unitMap.finney).toPrecision()))
        .then(() => eth.getBalance(accounts[3]))
        .then((balance) => expect(util.toBN(balance).minus(previousBalance).toPrecision()).to.eql(util.toBN('500').times(unitMap.finney).toPrecision()));
    }));
  });
});
