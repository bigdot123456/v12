'use strict';

const expect = require('chai').expect;
const eth = require('./eth');
const {join} = require('path');
const util = require('./util');
const {generate} = require('ethereumjs-wallet');
const BN = require('bignumber.js');
const Transaction = require('ethereumjs-tx');
const {unitMap, fromDecimal, soliditySha3} = require('web3-utils');
const {property, mapValues, method, partial, bindKey} = require('lodash');
const {flow} = require('lodash/fp');
const compose = require('promise-compose');
const {
  toBuffer,
  hashPersonalMessage,
  ecsign,
  bufferToHex,
} = require('ethereumjs-util');
const curryN = require('lodash/fp/curryN');
const {readFileSync} = require('fs');

const exchangeInterface = JSON.parse(
  readFileSync(join(__dirname, '..', 'Exchange.interface')),
);

const getContractBalance = curryN(3, (contract, user, token) =>
  eth.call({
    to: contract,
    data: eth.encodeFunctionCall(
      {
        name: 'tokens',
        inputs: [
          {
            name: 'token',
            type: 'address',
          },
          {
            name: 'user',
            type: 'address',
          },
        ],
      },
      [token, user],
    ),
  }),
);

const joinCurry3 = curryN(3, join);
const joinToParentDir = joinCurry3(__dirname)('..');

const sendTxCurried = curryN(
  3,
  (
    {gas, gasPrice},
    to,
    {
      from,
      data,
      to: toOverride,
      gas: gasOverride,
      gasPrice: gasPriceOverride,
      value,
    },
  ) =>
    eth.sendTransaction({
      gas: gasOverride || gas,
      gasPrice: gasPriceOverride || gasPrice,
      to: toOverride || to,
      from,
      data,
      value,
    }),
);

const sendOfflineTx = ({data, value, to, from, pk}) =>
  Promise.all([
    eth.getTransactionCount(from, 'pending'),
    eth.getBlock('pending').then(property('gasLimit')),
    eth.getGasPrice(),
  ]).then(([nonce, gas, gasPrice]) => {
    const tx = new Transaction({
      gasLimit: fromDecimal(gas),
      gasPrice: fromDecimal(gasPrice),
      nonce: fromDecimal(nonce),
      data,
      from,
      to,
      value: fromDecimal(value),
    });
    tx.sign(pk);
    return eth.sendSignedTransaction(bufferToHex(tx.serialize()));
  });

const getContractAddressFromTx = compose(
  eth.getTransactionReceipt,
  property('contractAddress'),
);

const wallet = generate();

const ETH_ADDRESS = '0x' + Array(41).join(0);

const uninitialized = () => Promise.reject(Error('Not initialized'));

const makerWallet = generate();
const takerWallet = generate();

const getBalance = (user, token) =>
  eth
    .call({
      to: token,
      data: eth.encodeFunctionCall(
        {
          name: 'balanceOf',
          inputs: [
            {
              name: 'holder',
              type: 'address',
            },
          ],
        },
        [user],
      ),
    })
    .then(util.toBN)
    .then(method('toPrecision'));

describe('IDEX contract v2', () => {
  let from,
    gas,
    gasPrice,
    exchangeContract,
    accounts,
    erc20Contract,
    erc20Contract2,
    eip777Contract,
    erc223Contract,
    erc223Contract2;
  let getCurrentContractBalance = curryN(2, uninitialized);
  let createContract = uninitialized,
    sendTx = uninitialized,
    sendEther = uninitialized,
    createContractFromFile = uninitialized,
    sendExchangeTx = uninitialized;
  before(() =>
    eth
      .getAccounts()
      .then(_accounts => (accounts = _accounts))
      .then(([_from]) => (from = _from))
      .then(() => eth.getGasPrice())
      .then(_gasPrice => (gasPrice = _gasPrice))
      .then(() => eth.getBlock('pending'))
      .then(property('gasLimit'))
      .then(_gas => (gas = _gas))
      .then(() => {
        createContract = compose(
          sendTxCurried({gas, gasPrice})(undefined),
          getContractAddressFromTx,
        );
        createContractFromFile = compose(
          util.readFileAsUtf8,
          bindKey(JSON, 'parse'),
          util.addHexPrefix,
          data => ({
            from,
            data,
          }),
          createContract,
        );
        sendTx = sendTxCurried({gas, gasPrice});
        sendEther = sendTx(undefined);
      })
      .then(() =>
        sendEther({
          to: wallet.getAddressString(),
          from,
          value: unitMap.ether,
        }),
      )
      .then(() => eth.getCode('0x9aa513f1294c8f1b254ba1188991b4cc2efe1d3b'))
      .then(code => util.toBN(code))
      .then(method('toPrecision'))
      .then(
        v =>
          v === '0' &&
          sendEther({
            to: '0xc253917a2b4a2b7f43286ae500132dae7dc22459',
            from,
            value: unitMap.ether,
          }).then(() => eth.sendSignedTransaction(require('./registry.json'))),
      )
      .then(() => createContractFromFile('Exchange.bytecode'))
      .then(contractAddress => (exchangeContract = contractAddress))
      .then(
        contractAddress =>
          (getCurrentContractBalance = getContractBalance(contractAddress)),
      )
      .then(() => createContractFromFile('ERC20.bytecode'))
      .then(tokenContract => (erc20Contract = tokenContract))
      .then(() => createContractFromFile('EIP777.bytecode'))
      .then(tokenContract => (eip777Contract = tokenContract))
      .then(() => createContractFromFile('ERC223.bytecode'))
      .then(tokenContract => (erc223Contract = tokenContract))
      .then(() => createContractFromFile('ERC223.bytecode'))
      .then(tokenContract => (erc223Contract2 = tokenContract))
      .then(() => createContractFromFile('ERC20.bytecode'))
      .then(tokenContract => (erc20Contract2 = tokenContract))
      .then(() => {
        sendExchangeTx = sendTx(exchangeContract);
      }),
  );

  describe('deposit function', () => {
    before(() =>
      sendEther({
        from,
        to: accounts[2],
        value: unitMap.ether,
      })
        .then(() =>
          sendTx(eip777Contract)({
            from,
            data: eth.encodeFunctionCall(
              {
                name: 'send',
                inputs: [
                  {
                    type: 'address',
                    name: 'target',
                  },
                  {
                    type: 'uint256',
                    name: 'amount',
                  },
                ],
              },
              [accounts[2], unitMap.ether],
            ),
          }),
        )
        .then(() =>
          sendTx(erc223Contract)({
            from,
            data: eth.encodeFunctionCall(
              {
                name: 'transfer',
                inputs: [
                  {
                    type: 'address',
                    name: 'target',
                  },
                  {
                    type: 'uint256',
                    name: 'amount',
                  },
                ],
              },
              [accounts[2], unitMap.ether],
            ),
          }),
        ),
    );
    it('should accept EIP777 deposits', () =>
      getCurrentContractBalance(accounts[2])(eip777Contract)
        .then(util.toBN)
        .then(method('toPrecision'))
        .then(balance =>
          sendTx(eip777Contract)({
            from: accounts[2],
            data: eth.encodeFunctionCall(
              {
                name: 'send',
                inputs: [
                  {
                    type: 'address',
                    name: 'target',
                  },
                  {
                    type: 'uint256',
                    name: 'amount',
                  },
                ],
              },
              [exchangeContract, unitMap.ether],
            ),
          })
            .then(() => getCurrentContractBalance(accounts[2])(eip777Contract))
            .then(util.toBN)
            .then(method('toPrecision'))
            .then(newBalance =>
              expect(
                util
                  .toBN(balance)
                  .plus(unitMap.ether)
                  .toPrecision(),
              ).to.eql(newBalance),
            ),
        ));
    it('should accept ERC223 deposits', () =>
      getCurrentContractBalance(accounts[2])(erc223Contract)
        .then(util.toBN)
        .then(method('toPrecision'))
        .then(balance =>
          sendTx(erc223Contract)({
            from: accounts[2],
            data: eth.encodeFunctionCall(
              {
                name: 'transfer',
                inputs: [
                  {
                    type: 'address',
                    name: 'target',
                  },
                  {
                    type: 'uint256',
                    name: 'amount',
                  },
                ],
              },
              [exchangeContract, unitMap.ether],
            ),
          })
            .then(() => getCurrentContractBalance(accounts[2])(erc223Contract))
            .then(util.toBN)
            .then(method('toPrecision'))
            .then(newBalance =>
              expect(
                util
                  .toBN(balance)
                  .plus(unitMap.ether)
                  .toPrecision(),
              ).to.eql(newBalance),
            ),
        ));
  });
  describe('deposit proxy', () => {
    let proxy,
      sendProxyTx = uninitialized;
    before(() =>
      sendExchangeTx({
        from: accounts[1],
        data: eth.encodeFunctionCall(
          {
            name: 'createDepositProxy',
            inputs: [
              {
                type: 'address',
                name: 'target',
              },
            ],
          },
          [accounts[1]],
        ),
      })
        .then(eth.getTransactionReceipt)
        .then(receipt =>
          eth.decodeLog(
            [
              {
                type: 'address',
                name: 'beneficiary',
              },
              {
                type: 'address',
                name: 'proxyAddress',
              },
            ],
            receipt.logs[1].data,
            [receipt.logs[1].topics[0]],
          ),
        )
        .then(property('proxyAddress'))
        .then(_proxy => (proxy = _proxy))
        .then(() => (sendProxyTx = sendTx(proxy)))
        .then(() =>
          sendTx(erc223Contract2)({
            from,
            data: eth.encodeFunctionCall(
              {
                name: 'transfer',
                inputs: [
                  {
                    name: 'target',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                ],
              },
              [accounts[1], unitMap.ether],
            ),
          }),
        ),
    );

    it('should forward ether deposits', () =>
      sendEther({
        to: proxy,
        from,
        value: unitMap.ether,
      }).then(() =>
        eth
          .call({
            to: exchangeContract,
            data: eth.encodeFunctionCall(
              {
                name: 'tokens',
                inputs: [
                  {
                    name: 'token',
                    type: 'address',
                  },
                  {
                    name: 'user',
                    type: 'address',
                  },
                ],
              },
              [ETH_ADDRESS, accounts[1]],
            ),
          })
          .then(util.toBN)
          .then(method('toPrecision'))
          .then(result => expect(result).to.eql(unitMap.ether)),
      ));
    it('should forward ERC-20 deposits', () =>
      sendTx(erc20Contract)({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'transfer',
            inputs: [
              {
                name: 'recipient',
                type: 'address',
              },
              {
                name: 'amount',
                type: 'uint256',
              },
            ],
          },
          [accounts[1], '1' + Array(19).join(0)],
        ),
      }).then(() =>
        sendTx(erc20Contract)({
          from: accounts[1],
          data: eth.encodeFunctionCall(
            {
              name: 'approveAndCall',
              inputs: [
                {
                  name: 'spender',
                  type: 'address',
                },
                {
                  name: 'amount',
                  type: 'uint256',
                },
                {
                  name: 'data',
                  type: 'bytes',
                },
              ],
            },
            [proxy, '1' + Array(19).join(0), '0x'],
          ),
        })
          .then(() => getCurrentContractBalance(accounts[1])(erc20Contract))
          .then(util.toBN)
          .then(method('toPrecision'))
          .then(amt => expect(amt).to.eql('1' + Array(19).join(0))),
      ));
    it('should forward EIP777 deposits', () =>
      sendTx(eip777Contract)({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'send',
            inputs: [
              {
                name: 'to',
                type: 'address',
              },
              {
                name: 'value',
                type: 'uint256',
              },
            ],
          },
          [proxy, '1' + Array(19).join(0)],
        ),
      })
        .then(() => getCurrentContractBalance(accounts[1])(eip777Contract))
        .then(util.toBN)
        .then(method('toPrecision'))
        .then(amt => expect(amt).to.eql('1' + Array(19).join(0))));
    it('should forward ERC223 deposits', () =>
      sendTx(erc223Contract2)({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'transfer',
            inputs: [
              {
                name: 'to',
                type: 'address',
              },
              {
                name: 'value',
                type: 'uint256',
              },
            ],
          },
          [proxy, '1' + Array(19).join(0)],
        ),
      })
        .then(() => getCurrentContractBalance(accounts[1])(erc223Contract2))
        .then(util.toBN)
        .then(method('toPrecision'))
        .then(amt => expect(amt).to.eql('1' + Array(19).join(0))));
  });

  describe('transfer fn', () => {
    it('should transfer funds to another wallet', () =>
      sendExchangeTx({
        from: accounts[1],
        data: eth.encodeFunctionCall(
          {
            name: 'deposit',
            inputs: [
              {
                name: 'target',
                type: 'address',
              },
            ],
          },
          [wallet.getAddressString()],
        ),
        value: unitMap.ether,
      })
        .then(() => {
          const nonce = 1;
          const token = ETH_ADDRESS;
          const amount = unitMap.ether;
          const user = wallet.getAddressString();
          const target = accounts[2];
          const raw = soliditySha3(
            ...[
              {
                t: 'address',
                v: exchangeContract,
              },
              {
                t: 'address',
                v: token,
              },
              {
                t: 'uint256',
                v: amount,
              },
              {
                t: 'address',
                v: user,
              },
              {
                t: 'address',
                v: target,
              },
              {
                t: 'uint256',
                v: nonce,
              },
            ],
          );
          const transferSalted = soliditySha3(
            ...[
              {
                t: 'string',
                v: '\x19IDEX Signed Transfer:\n32',
              },
              {
                t: 'bytes32',
                v: raw,
              },
            ],
          );
          const salted = bufferToHex(
            hashPersonalMessage(toBuffer(transferSalted)),
          );
          const {v, r, s} = mapValues(
            ecsign(toBuffer(salted), wallet.getPrivateKey()),
            (v, k) => (k === 'v' ? v : bufferToHex(v)),
          );
          return sendExchangeTx({
            from,
            data: eth.encodeFunctionCall(
              {
                name: 'transfer',
                inputs: [
                  {
                    name: 'token',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                  {
                    name: 'user',
                    type: 'address',
                  },
                  {
                    name: 'target',
                    type: 'address',
                  },
                  {
                    name: 'nonce',
                    type: 'uint256',
                  },
                  {
                    name: 'v',
                    type: 'uint8',
                  },
                  {
                    name: 'r',
                    type: 'bytes32',
                  },
                  {
                    name: 's',
                    type: 'bytes32',
                  },
                  {
                    name: 'feeTransfer',
                    type: 'uint256',
                  },
                ],
              },
              [
                token,
                amount,
                user,
                target,
                nonce,
                v,
                r,
                s,
                '1' + Array(18).join(0),
              ],
            ),
          });
        })
        .then(() =>
          eth
            .call({
              to: exchangeContract,
              data: eth.encodeFunctionCall(
                {
                  name: 'tokens',
                  inputs: [
                    {
                      name: 'token',
                      type: 'address',
                    },
                    {
                      name: 'user',
                      type: 'address',
                    },
                  ],
                },
                [ETH_ADDRESS, accounts[2]],
              ),
            })
            .then(util.toBN)
            .then(method('toPrecision')),
        )
        .then(result => expect(result).to.eql('9' + Array(18).join(0))));
  });
  describe('withdraw fn', () => {
    const walletToWithdraw = generate();
    before(() =>
      getCurrentContractBalance(wallet.getAddressString())(ETH_ADDRESS)
        .then(util.toBN)
        .then(method('toPrecision'))
        .then(result => expect(result).to.eql('0')),
    );
    it('should perform a token withdrawal', () =>
      sendTx(erc20Contract2)({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'transfer',
            inputs: [
              {
                name: 'beneficiary',
                type: 'address',
              },
              {
                name: 'amount',
                type: 'uint256',
              },
            ],
          },
          [walletToWithdraw.getAddressString(), unitMap.ether],
        ),
      })
        .then(() =>
          sendEther({
            from,
            to: walletToWithdraw.getAddressString(),
            value: unitMap.ether,
          }),
        )
        .then(() =>
          sendOfflineTx({
            to: erc20Contract2,
            from: walletToWithdraw.getAddressString(),
            data: eth.encodeFunctionCall(
              {
                name: 'approveAndCall',
                inputs: [
                  {
                    name: 'beneficiary',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                  {
                    name: 'data',
                    type: 'bytes',
                  },
                ],
              },
              [exchangeContract, unitMap.ether, '0x'],
            ),
            pk: walletToWithdraw.getPrivateKey(),
          }),
        )
        .then(() => getBalance(exchangeContract, erc20Contract2))
        .then(balance => expect(balance).to.eql(unitMap.ether))
        .then(() =>
          getBalance(walletToWithdraw.getAddressString(), erc20Contract2),
        )
        .then(expect)
        .then(method('to.eql', '0'))
        .then(() =>
          Promise.all([
            eth
              .call({
                to: erc20Contract2,
                data: eth.encodeFunctionCall(
                  {
                    name: 'balanceOf',
                    inputs: [
                      {
                        name: 'holder',
                        type: 'address',
                      },
                    ],
                  },
                  [walletToWithdraw.getAddressString()],
                ),
              })
              .then(util.toBN)
              .then(method('toPrecision')),
            getCurrentContractBalance(ETH_ADDRESS)(erc20Contract2),
          ]).then(([previousBalance, previousFeeBalance]) => {
            const token = erc20Contract2;
            const amount = unitMap.ether;
            const user = walletToWithdraw.getAddressString();
            const target = ETH_ADDRESS;
            const authorizeArbitraryFee = false;
            const nonce = 1;
            const feeWithdrawal = '0';
            const {v, r, s} = mapValues(
              ecsign(
                hashPersonalMessage(
                  toBuffer(
                    soliditySha3(
                      ...[
                        {
                          t: 'address',
                          v: exchangeContract,
                        },
                        {
                          t: 'address',
                          v: token,
                        },
                        {
                          t: 'uint256',
                          v: amount,
                        },
                        {
                          t: 'address',
                          v: user,
                        },
                        {
                          t: 'address',
                          v: target,
                        },
                        {
                          t: 'bool',
                          v: authorizeArbitraryFee,
                        },
                        {
                          t: 'uint256',
                          v: nonce,
                        },
                      ],
                    ),
                  ),
                ),
                walletToWithdraw.getPrivateKey(),
              ),
              (v, k) => (k === 'v' ? v : bufferToHex(v)),
            );
            return sendExchangeTx({
              from,
              data: eth.encodeFunctionCall(
                exchangeInterface.find(({name}) => name === 'adminWithdraw'),
                [
                  token,
                  amount,
                  user,
                  target,
                  authorizeArbitraryFee,
                  nonce,
                  v,
                  r,
                  s,
                  feeWithdrawal,
                ],
              ),
            })
              .then(() =>
                getBalance(walletToWithdraw.getAddressString(), erc20Contract2),
              )
              .then(balance => expect(balance).to.eql(unitMap.ether));
          }),
        ));
    it('should cap regular withdrawals at 10% fee', () =>
      sendExchangeTx({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'deposit',
            inputs: [
              {
                name: 'beneficiary',
                type: 'address',
              },
            ],
          },
          [wallet.getAddressString()],
        ),
        value: unitMap.ether,
      })
        .then(() =>
          Promise.all([
            eth.getBalance(accounts[3]),
            getCurrentContractBalance(ETH_ADDRESS)(ETH_ADDRESS),
          ]),
        )
        .then(([previousBalance, previousFeeBalance]) => {
          const token = ETH_ADDRESS;
          const amount = unitMap.ether;
          const user = wallet.getAddressString();
          const target = accounts[3];
          const authorizeArbitraryFee = false;
          const nonce = 1;
          const feeWithdrawal = util
            .toBN(unitMap.ether)
            .dividedToIntegerBy(2)
            .toPrecision();
          const {v, r, s} = mapValues(
            ecsign(
              hashPersonalMessage(
                toBuffer(
                  soliditySha3(
                    ...[
                      {
                        t: 'address',
                        v: exchangeContract,
                      },
                      {
                        t: 'address',
                        v: token,
                      },
                      {
                        t: 'uint256',
                        v: amount,
                      },
                      {
                        t: 'address',
                        v: user,
                      },
                      {
                        t: 'address',
                        v: target,
                      },
                      {
                        t: 'bool',
                        v: authorizeArbitraryFee,
                      },
                      {
                        t: 'uint256',
                        v: nonce,
                      },
                    ],
                  ),
                ),
              ),
              wallet.getPrivateKey(),
            ),
            (v, k) => (k === 'v' ? v : bufferToHex(v)),
          );
          return sendExchangeTx({
            from,
            data: eth.encodeFunctionCall(
              exchangeInterface.find(({name}) => name === 'adminWithdraw'),
              [
                token,
                amount,
                user,
                target,
                authorizeArbitraryFee,
                nonce,
                v,
                r,
                s,
                feeWithdrawal,
              ],
            ),
          })
            .then(() => getCurrentContractBalance(ETH_ADDRESS)(ETH_ADDRESS))
            .then(balance =>
              expect(
                util
                  .toBN(balance)
                  .minus(util.toBN(previousFeeBalance))
                  .toPrecision(),
              ).to.eql(
                util
                  .toBN('100')
                  .times(unitMap.finney)
                  .toPrecision(),
              ),
            )
            .then(() => eth.getBalance(accounts[3]))
            .then(balance =>
              expect(
                util
                  .toBN(balance)
                  .minus(previousBalance)
                  .toPrecision(),
              ).to.eql(
                util
                  .toBN('900')
                  .times(unitMap.finney)
                  .toPrecision(),
              ),
            );
        }));
    it('should allow an uncapped fee for withdrawals', () =>
      sendExchangeTx({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'deposit',
            inputs: [
              {
                name: 'beneficiary',
                type: 'address',
              },
            ],
          },
          [wallet.getAddressString()],
        ),
        value: unitMap.ether,
      })
        .then(() =>
          Promise.all([
            eth.getBalance(accounts[3]),
            getCurrentContractBalance(ETH_ADDRESS)(ETH_ADDRESS),
          ]),
        )
        .then(([previousBalance, previousFeeBalance]) => {
          const token = ETH_ADDRESS;
          const amount = unitMap.ether;
          const user = wallet.getAddressString();
          const target = accounts[3];
          const authorizeArbitraryFee = true;
          const nonce = 1;
          const feeWithdrawal = util
            .toBN(unitMap.ether)
            .dividedToIntegerBy(2)
            .toPrecision();
          const {v, r, s} = mapValues(
            ecsign(
              hashPersonalMessage(
                toBuffer(
                  soliditySha3(
                    ...[
                      {
                        t: 'address',
                        v: exchangeContract,
                      },
                      {
                        t: 'address',
                        v: token,
                      },
                      {
                        t: 'uint256',
                        v: amount,
                      },
                      {
                        t: 'address',
                        v: user,
                      },
                      {
                        t: 'address',
                        v: target,
                      },
                      {
                        t: 'bool',
                        v: authorizeArbitraryFee,
                      },
                      {
                        t: 'uint256',
                        v: nonce,
                      },
                    ],
                  ),
                ),
              ),
              wallet.getPrivateKey(),
            ),
            (v, k) => (k === 'v' ? v : bufferToHex(v)),
          );
          return sendExchangeTx({
            from,
            data: eth.encodeFunctionCall(
              exchangeInterface.find(({name}) => name === 'adminWithdraw'),
              [
                token,
                amount,
                user,
                target,
                authorizeArbitraryFee,
                nonce,
                v,
                r,
                s,
                feeWithdrawal,
              ],
            ),
          })
            .then(() => getCurrentContractBalance(ETH_ADDRESS)(ETH_ADDRESS))
            .then(balance =>
              expect(
                util
                  .toBN(balance)
                  .minus(util.toBN(previousFeeBalance))
                  .toPrecision(),
              ).to.eql(
                util
                  .toBN('500')
                  .times(unitMap.finney)
                  .toPrecision(),
              ),
            )
            .then(() => eth.getBalance(accounts[3]))
            .then(balance =>
              expect(
                util
                  .toBN(balance)
                  .minus(previousBalance)
                  .toPrecision(),
              ).to.eql(
                util
                  .toBN('500')
                  .times(unitMap.finney)
                  .toPrecision(),
              ),
            );
        }));
  });
  let flag = true;
  describe('ERC-20 recovery function', () => {
    it('should allow recovery of ERC20 tokens improperly deposited', () =>
      sendTx(erc20Contract)({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'approveAndCall',
            inputs: [
              {
                name: 'beneficiary',
                type: 'address',
              },
              {
                name: 'amount',
                type: 'uint256',
              },
              {
                name: 'data',
                type: 'bytes',
              },
            ],
          },
          [exchangeContract, unitMap.ether, '0x'],
        ),
      })
        .then(() =>
          sendTx(erc20Contract)({
            from,
            data: eth.encodeFunctionCall(
              {
                name: 'transfer',
                inputs: [
                  {
                    name: 'beneficiary',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                ],
              },
              [exchangeContract, unitMap.ether],
            ),
          }),
        )
        .then(() =>
          sendExchangeTx({
            from,
            data: eth.encodeFunctionCall(
              {
                name: 'withdrawUnprotectedFunds',
                inputs: [
                  {
                    name: 'token',
                    type: 'address',
                  },
                  {
                    name: 'target',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                  {
                    name: 'isEIP777',
                    type: 'bool',
                  },
                ],
              },
              [
                erc20Contract,
                accounts[5],
                new BN(unitMap.ether).plus(1).toPrecision(),
                false,
              ],
            ),
          })
            .catch(() => (flag = false))
            .then(() => expect(flag).to.be.false),
        )
        .then(() =>
          sendExchangeTx({
            from,
            data: eth.encodeFunctionCall(
              {
                name: 'withdrawUnprotectedFunds',
                inputs: [
                  {
                    name: 'token',
                    type: 'address',
                  },
                  {
                    name: 'target',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                  {
                    name: 'isEIP777',
                    type: 'bool',
                  },
                ],
              },
              [erc20Contract, accounts[5], unitMap.ether, false],
            ),
          }),
        ));
  });
  describe('trade function', () => {
    before(() =>
      sendEther({
        from,
        to: makerWallet.getAddressString(),
        value: unitMap.ether,
      })
        .then(() =>
          sendEther({
            from,
            to: takerWallet.getAddressString(),
            value: unitMap.ether,
          }),
        )
        .then(() =>
          sendTx(erc20Contract)({
            from,
            data: eth.encodeFunctionCall(
              {
                name: 'transfer',
                inputs: [
                  {
                    name: 'beneficiary',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                ],
              },
              [makerWallet.getAddressString(), unitMap.ether],
            ),
          }),
        )
        .then(() =>
          sendOfflineTx({
            from: takerWallet.getAddressString(),
            to: exchangeContract,
            data: eth.encodeFunctionCall(
              {
                name: 'deposit',
                inputs: [
                  {
                    type: 'address',
                    name: 'beneficiary',
                  },
                ],
              },
              [ETH_ADDRESS],
            ),
            value: '1000',
            pk: takerWallet.getPrivateKey(),
          }),
        )
        .then(() =>
          sendOfflineTx({
            from: makerWallet.getAddressString(),
            to: erc20Contract,
            data: eth.encodeFunctionCall(
              {
                name: 'approveAndCall',
                inputs: [
                  {
                    name: 'beneficiary',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                  {
                    name: 'data',
                    type: 'bytes',
                  },
                ],
              },
              [exchangeContract, '10000', '0x'],
            ),
            value: '0',
            pk: makerWallet.getPrivateKey(),
          }),
        ),
    );
    it('can execute a trade', () => {
      const contractAddress = exchangeContract;
      const tokenBuy = ETH_ADDRESS;
      const amountBuy = '1000';
      const tokenSell = erc20Contract;
      const amountSell = '10000';
      const expires = '10000';
      const nonce = '0';
      const user = makerWallet.getAddressString();
      const orderHash = soliditySha3(
        {
          t: 'address',
          v: contractAddress,
        },
        {
          t: 'address',
          v: tokenBuy,
        },
        {
          t: 'uint256',
          v: amountBuy,
        },
        {
          t: 'address',
          v: tokenSell,
        },
        {
          t: 'uint256',
          v: amountSell,
        },
        {
          t: 'uint256',
          v: expires,
        },
        {
          t: 'uint256',
          v: nonce,
        },
        {
          t: 'address',
          v: user,
        },
      );
      const amount = '1000';
      const taker = takerWallet.getAddressString();
      const tradeNonce = '0';
      const tradeHash = soliditySha3(
        {
          t: 'bytes32',
          v: orderHash,
        },
        {
          t: 'uint256',
          v: amount,
        },
        {
          t: 'address',
          v: taker,
        },
        {
          t: 'uint256',
          v: tradeNonce,
        },
      );
      const {v, r, s} = mapValues(
        ecsign(
          hashPersonalMessage(toBuffer(orderHash)),
          makerWallet.getPrivateKey(),
        ),
        (v, k) => (k === 'v' ? v : bufferToHex(v)),
      );
      const {v: tradeV, r: tradeR, s: tradeS} = mapValues(
        ecsign(
          hashPersonalMessage(toBuffer(tradeHash)),
          takerWallet.getPrivateKey(),
        ),
        (v, k) => (k === 'v' ? v : bufferToHex(v)),
      );
      const feeMake = new BN('0.00001').times(unitMap.ether).toPrecision();
      const feeTake = feeMake;
      return sendExchangeTx({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'trade',
            inputs: [
              {
                type: 'uint256[8]',
                name: 'tradeValues',
              },
              {
                type: 'address[4]',
                name: 'tradeAddresses',
              },
              {
                type: 'uint8[2]',
                name: 'v',
              },
              {
                type: 'bytes32[4]',
                name: 'rs',
              },
            ],
          },
          [
            [
              amountBuy,
              amountSell,
              expires,
              nonce,
              amount,
              tradeNonce,
              feeMake,
              feeTake,
            ],
            [tokenBuy, tokenSell, user, taker],
            [v, tradeV],
            [r, s, tradeR, tradeS],
          ],
        ),
      })
        .then(() => getCurrentContractBalance(taker, erc20Contract))
        .then(balance => util.toBN(balance).toPrecision())
        .then(balance => expect(balance).to.eql('10000'));
    });
  });
  describe('withdrawal fn', () => {
    const walletToWithdraw = generate();
    before(() =>
      sendTx(erc20Contract2)({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'transfer',
            inputs: [
              {
                name: 'beneficiary',
                type: 'address',
              },
              {
                name: 'amount',
                type: 'uint256',
              },
            ],
          },
          [walletToWithdraw.getAddressString(), unitMap.ether],
        ),
      })
        .then(() =>
          sendEther({
            from,
            to: walletToWithdraw.getAddressString(),
            value: unitMap.ether,
          }),
        )
        .then(() =>
          sendOfflineTx({
            from: walletToWithdraw.getAddressString(),
            to: erc20Contract2,
            data: eth.encodeFunctionCall(
              {
                name: 'approveAndCall',
                inputs: [
                  {
                    name: 'beneficiary',
                    type: 'address',
                  },
                  {
                    name: 'amount',
                    type: 'uint256',
                  },
                  {
                    name: 'data',
                    type: 'bytes',
                  },
                ],
              },
              [exchangeContract, unitMap.ether, '0x'],
            ),
            pk: walletToWithdraw.getPrivateKey(),
          }),
        ),
    );
    /*
    it('should execute a withdrawal', () => {
      const contractAddress = exchangeContract;
      const token = erc20Contract2;
      const amount = util.toBN(unitMap.ether).div(2).toPrecision();
      const user = walletToWithdraw.getAddressString();
      const target = ETH_ADDRESS;
      const authorizeArbitraryFee = false;
      const nonce = '0';
      const feeWithdrawal = '1';
      const {v, r, s} = mapValues(
        ecsign(
          hashPersonalMessage(
            toBuffer(
              soliditySha3(...[
                {
                  t: 'address',
                  v: contractAddress,
                },
                {
                  t: 'address',
                  v: token,
                },
                {
                  t: 'uint256',
                  v: amount,
                },
                {
                  t: 'address',
                  v: user,
                },
                {
                  t: 'address',
                  v: target,
                },
                {
                  t: 'bool',
                  v: authorizeArbitraryFee,
                },
                {
                  t: 'uint256',
                  v: nonce,
                },
              ]),
            ),
          ),
          walletToWithdraw.getPrivateKey(),
        ),
        (v, k) => (k === 'v' ? v : bufferToHex(v)),
      );
      return sendExchangeTx({
        from,
        data: eth.encodeFunctionCall(
          {
            name: 'adminWithdraw',
            inputs: [
              {
                name: 'token',
                type: 'address',
              },
              {
                name: 'amount',
                type: 'uint256',
              },
              {
                name: 'user',
                type: 'address',
              },
              {
                name: 'target',
                type: 'address',
              },
              {
                name: 'authorizeArbitraryFee',
                type: 'bool',
              },
              {
                name: 'nonce',
                type: 'uint256',
              },
              {
                name: 'v',
                type: 'uint8',
              },
              {
                name: 'r',
                type: 'bytes32',
              },
              {
                name: 's',
                type: 'bytes32',
              },
              {
                name: 'feeWithdrawal',
                type: 'uint256',
              },
            ],
          },
          [
            token,
            amount,
            user,
            target,
            authorizeArbitraryFee,
            nonce,
            v,
            r,
            s,
            feeWithdrawal,
          ],
        ),
      });
    });
*/
  });
});
