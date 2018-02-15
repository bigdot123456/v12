'use strict';

const solc = require('solc');
const src = require('fs').readFileSync('./ERC223.sol', 'utf8');

const out = solc.compile(src, 1);
if (out.errors) {
  out.errors.forEach((v) => console.log(v));
}
console.log(Object.keys(out.contracts));
const Exchange = out.contracts[':AxpireToken'];

const abi = JSON.parse(Exchange.interface);
const bytecode = Exchange.bytecode;
const fs = require('fs');
fs.writeFileSync('./ERC223.bytecode', JSON.stringify(bytecode));
fs.writeFileSync('./ERC223.interface', JSON.stringify(abi, null, 1));
