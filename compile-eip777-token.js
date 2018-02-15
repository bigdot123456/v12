'use strict';

const solc = require('solc');
const src = require('fs').readFileSync('./EIP777.sol', 'utf8');

const out = solc.compile(src, 1);
if (out.errors) {
  console.log(out.errors);
}
const Exchange = out.contracts[':ReferenceToken'];

const abi = JSON.parse(Exchange.interface);
const bytecode = Exchange.bytecode;
const fs = require('fs');
fs.writeFileSync('./EIP777.bytecode', JSON.stringify(bytecode));
fs.writeFileSync('./EIP777.interface', JSON.stringify(abi, null, 1));
