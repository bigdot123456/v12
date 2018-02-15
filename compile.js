'use strict';

const solc = require('solc');
const src = require('fs').readFileSync('./Exchange.sol', 'utf8');

const out = solc.compile(src, 1);
if (out.errors && out.errors.length) {
  out.errors.forEach((v) => {
    console.log(v);
  });
}

if (out.contracts && out.contracts[':Exchange']) {
  const Exchange = out.contracts[':Exchange'];

  const abi = JSON.parse(Exchange.interface);
  const bytecode = Exchange.bytecode;
  const fs = require('fs');
  fs.writeFileSync('./Exchange.bytecode', JSON.stringify(bytecode));
  fs.writeFileSync('./Exchange.interface', JSON.stringify(abi, null, 1));
}
