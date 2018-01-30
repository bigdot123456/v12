'use strict';

const solc = require('solc');
const src = require('fs').readFileSync('./Exchange.sol', 'utf8');

const out = solc.compile(src, 1);
if (out.errors) {
  console.log(out.errors);
}
const Exchange = out.contracts[':Exchange'];

const abi = JSON.parse(Exchange.interface);
const bytecode = Exchange.bytecode;
console.log(abi);
console.log(bytecode);
const fs = require('fs');
fs.writeFileSync('./Exchange.bytecode', JSON.stringify(bytecode));
fs.writeFileSync('./Exchange.interface', JSON.stringify(abi, null, 1));
