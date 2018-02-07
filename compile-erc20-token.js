'use strict';

const solc = require('solc');
const src = require('fs').readFileSync('./ERC20.sol', 'utf8');

const out = solc.compile(src, 1);
if (out.errors) {
  console.log(out.errors);
}
const Exchange = out.contracts[':ERC20'];

const abi = JSON.parse(Exchange.interface);
const bytecode = Exchange.bytecode;
const fs = require('fs');
fs.writeFileSync('./ERC20.bytecode', JSON.stringify(bytecode));
fs.writeFileSync('./ERC20.interface', JSON.stringify(abi, null, 1));
