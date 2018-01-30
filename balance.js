'use strict';

const eth = require('./eth');
const util = require('./util');

eth.getAccounts().then(([ account ]) => eth.getBalance(account)).then(util.ln);
