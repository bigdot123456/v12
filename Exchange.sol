pragma solidity ^0.4.16;

contract Token {
    bytes32 public standard;
    bytes32 public name;
    bytes32 public symbol;
    uint256 public totalSupply;
    uint8 public decimals;
    bool public allowTransactions;
    mapping (address => uint256) public balanceOf;
    mapping (address => mapping (address => uint256)) public allowance;
    function transfer(address _to, uint256 _value) returns (bool success);
    function approveAndCall(address _spender, uint256 _value, bytes _extraData) returns (bool success);
    function approve(address _spender, uint256 _value) returns (bool success);
    function transferFrom(address _from, address _to, uint256 _value) returns (bool success);
}

interface EIP777 {
    function name() public constant returns (string);
    function symbol() public constant returns (string);
    function granularity() public constant returns (uint256);
    function totalSupply() public constant returns (uint256);
    function balanceOf(address owner) public constant returns (uint256);

    function send(address to, uint256 value) public;
    function send(address to, uint256 value, bytes userData) public;

    function authorizeOperator(address operator) public;
    function revokeOperator(address operator) public;
    function isOperatorFor(address operator, address tokenHolder) public constant returns (bool);
    function operatorSend(address from, address to, uint256 value, bytes userData, bytes operatorData) public;

    event Sent(address indexed from, address indexed to, uint256 value, address indexed operator, bytes userData, bytes operatorData);
    event Minted(address indexed to, uint256 amount, address indexed operator, bytes operatorData);
    event Burnt(address indexed from, uint256 value);
    event AuthorizedOperator(address indexed operator, address indexed tokenHolder);
    event RevokedOperator(address indexed operator, address indexed tokenHolder);
}

contract ERC233 {
  function transfer(address target, uint256 amount, bytes data);
}

contract InterfaceImplementationRegistry {

    mapping (address => mapping(bytes32 => address)) interfaces;
    mapping (address => address) public managers;

    modifier canManage(address addr) {
        require(msg.sender == addr || msg.sender == managers[addr]);
        _;
    }

    function interfaceHash(string interfaceName) public pure returns(bytes32) {
        return keccak256(interfaceName);
    }


    /// @notice Query if an address implements an interface and thru which contract
    /// @param addr Address that is being queried for the implementation of an interface
    /// @param iHash SHA3 of the name of the interface as a string
    ///  Example `web3.utils.sha3('Ierc777`')`
    /// @return The address of the contract that implements a speficic interface
    ///  or 0x0 if `addr` does not implement this interface
    function getInterfaceImplementer(address addr, bytes32 iHash) public constant returns (address) {
        return interfaces[addr][iHash];
    }

    /// @notice Sets the contract that will handle a specific interface; only
    ///  the address itself or a `manager` defined for that address can set it
    /// @param addr Address that you want to define the interface for
    /// @param iHash SHA3 of the name of the interface as a string
    ///  For example `web3.utils.sha3('Ierc777')` for the Ierc777
    function setInterfaceImplementer(address addr, bytes32 iHash, address implementer) public canManage(addr)  {
        interfaces[addr][iHash] = implementer;
        InterfaceImplementerSet(addr, iHash, implementer);
    }

    /// @notice Sets an external `manager` that will be able to call `setInterfaceImplementer()`
    ///  on behalf of the address.
    /// @param addr Address that you are defining the manager for.
    /// @param newManager The address of the manager for the `addr` that will replace
    ///  the old one.  Set to 0x0 if you want to remove the manager.
    function changeManager(address addr, address newManager) public canManage(addr) {
        managers[addr] = newManager;
        ManagerChanged(addr, newManager);
    }

    event InterfaceImplementerSet(address indexed addr, bytes32 indexed interfaceHash, address indexed implementer);
    event ManagerChanged(address indexed addr, address indexed newManager);
}

contract DepositReceiver {
  function deposit(address target) payable;
  function depositToken(address token, address target, uint256 amount);
}

contract BytesToAddress {
  function bytesToAddress(bytes _address) public returns (address) {
    uint160 m = 0;
    uint160 b = 0;
    for (uint8 i = 0; i < 20; i++) {
      m *= 256;
      b = uint160(_address[i]);
      m += (b);
    }
    return address(m);
  }
}

contract AddressToBytes {
  function addressToBytes(address a) constant returns (bytes b) {
     assembly {
        let m := mload(0x40)
        mstore(add(m, 20), xor(0x140000000000000000000000000000000000000000, a))
        mstore(0x40, add(m, 52))
        b := m
     }
  }
}

contract DepositProxy is AddressToBytes {
  address public beneficiary;
  address public exchange;
  event Deposit(address token, uint256 amount);
  function DepositProxy(address _exchange, address _beneficiary) {
    exchange = _exchange;
    beneficiary = _beneficiary;
  }
  function tokenFallback(address sender, uint256 amount, bytes data) {
    ERC233(msg.sender).transfer(exchange, amount, addressToBytes(beneficiary));
    Deposit(msg.sender, amount);
  }
  function tokensReceived(address from, address to, uint256 amount, bytes userData, address operator, bytes operatorData) public {
    require(to == address(this));
    EIP777(msg.sender).send(exchange, amount, addressToBytes(beneficiary));
    Deposit(msg.sender, amount);
  }
  function approveAndDeposit(address token, uint256 amount) internal {
    Token(token).approve(exchange, amount);
    DepositReceiver(exchange).depositToken(token, beneficiary, amount);
    Deposit(token, amount);
  }
  function receiveApproval(address from, uint256 tokens, address token, bytes data) public {
    require(token == msg.sender);
    require(from == beneficiary);
    require(Token(msg.sender).transferFrom(from, this, tokens));
    approveAndDeposit(token, tokens);
  }
  function depositAll(address token) {
    approveAndDeposit(token, Token(token).balanceOf(this));
  }
  function () external payable {
    DepositReceiver(exchange).deposit.value(msg.value)(beneficiary);
    Deposit(0x0, msg.value);
  }
}

contract SafeMath {
  function safeMul(uint a, uint b) returns (uint) {
    uint c = a * b;
    require(a == 0 || c / a == b);
    return c;
  }
  function safeSub(uint a, uint b) returns (uint) {
    require(b <= a);
    return a - b;
  }
  function safeAdd(uint a, uint b) returns (uint) {
    uint c = a + b;
    require(c>=a && c>=b);
    return c;
  }
}

contract Owned {
  address public owner;
  function Owned() {
    owner = msg.sender;
  }
  event SetOwner(address indexed previousOwner, address indexed newOwner);
  modifier onlyOwner {
    require(msg.sender == owner);
    _;
  }
  function setOwner(address newOwner) onlyOwner {
    SetOwner(owner, newOwner);
    owner = newOwner;
  }
  function getOwner() returns (address out) {
    return owner;
  }
}

contract Exchange is SafeMath, Owned, BytesToAddress {
  string constant TRANSFER_SALT = "\x19IDEX Signed Transfer:\n32";
  mapping (address => uint256) public invalidOrder;
  event ProxyCreated(address beneficiary, address proxyAddress);
  function createDepositProxy(address target) external returns (address proxyAddress) {
    address trueTarget = target;
    if (target == 0x0) trueTarget = msg.sender;
    DepositProxy dp = new DepositProxy(this, trueTarget);
    ProxyCreated(trueTarget, address(dp));
    return address(dp);
  }
  function invalidateOrdersBefore(address user, uint256 nonce) onlyAdmin {
    if (nonce < invalidOrder[user]) throw;
    invalidOrder[user] = nonce;
  }

  mapping (address => mapping (address => uint256)) public tokens; //mapping of token addresses to mapping of account balances

  mapping (address => bool) public admins;
  mapping (address => mapping (address => uint256)) public lastActiveTransaction; // address to token to timestamp
  mapping (bytes32 => uint256) public orderFills;
  address public feeAccount;
  uint256 public inactivityReleasePeriod;
  mapping (bytes32 => bool) public traded;
  mapping (bytes32 => bool) public withdrawn;
  mapping (bytes32 => bool) public transferred;
  mapping (address => uint256) public protectedFunds;
  mapping (address => bool) public thirdPartyDepositorDisabled;
  event Trade(address tokenBuy, address tokenSell, address maker, address taker, uint256 amount, bytes32 hash);
  event Deposit(address token, address user, uint256 amount, uint256 balance);
  event Withdraw(address token, address user, uint256 amount, uint256 balance);
  event Transfer(address token, address recipient);

  function setInactivityReleasePeriod(uint256 expiry) onlyAdmin returns (bool success) {
    if (expiry > 1000000) throw;
    inactivityReleasePeriod = expiry;
    return true;
  }

  function Exchange(address feeAccount_) {
    feeAccount = feeAccount_;
    inactivityReleasePeriod = 100000;
  }

  function setThirdPartyDepositorDisabled(bool disabled) external returns (bool success) {
    thirdPartyDepositorDisabled[msg.sender] = disabled;
    return true;
  }

  function withdrawUnprotectedFunds(address token, address target, uint256 amount, bool isEIP777) onlyOwner returns (bool success) {
    require(safeSub(Token(token).balanceOf(this), protectedFunds[token]) <= amount);
    if (isEIP777) EIP777(token).send(target, amount);
    else Token(token).transfer(target, amount);
    return true;
  }

  function setAdmin(address admin, bool isAdmin) onlyOwner {
    admins[admin] = isAdmin;
  }

  modifier onlyAdmin {
    if (msg.sender != owner && !admins[msg.sender]) throw;
    _;
  }

  function depositToken(address token, address target, uint256 amount) {
    require(target != 0x0);
    require(acceptDeposit(token, target, amount));
    require(Token(token).transferFrom(msg.sender, this, amount));
  }

  function acceptDeposit(address token, address target, uint256 amount) internal returns (bool success) {
    require(!thirdPartyDepositorDisabled[msg.sender] || msg.sender == target);
    tokens[token][target] = safeAdd(tokens[token][target], amount);
    protectedFunds[token] = safeAdd(protectedFunds[token], amount);
    lastActiveTransaction[target][token] = block.number;
    Deposit(token, target, amount, tokens[token][target]);
    return true;
  }
    
  function deposit(address target) payable {
    require(target != 0x0);
    require(acceptDeposit(0x0, target, msg.value));
  }

  function tokenFallback(address target, uint256 amount, bytes data) {
    address beneficiary = bytesToAddress(data);
    if (beneficiary != 0x0) target = beneficiary;
    require(acceptDeposit(msg.sender, target, amount));
  }

  function tokensReceived(address from, address to, uint256 amount, bytes userData, address operator, bytes operatorData) public {
    require(to == address(this));
    address beneficiary = bytesToAddress(userData);
    if (beneficiary != 0x0) from = beneficiary;
    require(acceptDeposit(msg.sender, from, amount));
  }

  function registerEIP777Interface() onlyOwner {
    InterfaceImplementationRegistry(0x94405C3223089A942B7597dB96Dc60FcA17B0E3A).setInterfaceImplementer(this, keccak256("Ierc777"), this);
  }

  function withdraw(address token, address target, uint256 amount) returns (bool success) {
    require(target != 0x0);
    if (safeSub(block.number, lastActiveTransaction[msg.sender][token]) < inactivityReleasePeriod) throw;
    if (tokens[token][msg.sender] < amount) throw;
    tokens[token][msg.sender] = safeSub(tokens[token][msg.sender], amount);
    protectedFunds[token] = safeSub(protectedFunds[token], amount);
    if (token == address(0)) {
      if (!target.send(amount)) throw;
    } else {
      if (!Token(token).transfer(target, amount)) throw;
    }
    Withdraw(token, msg.sender, amount, tokens[token][msg.sender]);
    return true;
  }

  function withdrawEIP777(address token, address target, uint256 amount) returns (bool success) {
    require(target != 0x0);
    if (safeSub(block.number, lastActiveTransaction[msg.sender][token]) < inactivityReleasePeriod) throw;
    if (tokens[token][msg.sender] < amount) throw;
    tokens[token][msg.sender] = safeSub(tokens[token][msg.sender], amount);
    amount = amount - (amount % EIP777(token).granularity());
    protectedFunds[token] = safeSub(protectedFunds[token], amount);
    EIP777(token).send(target, amount);
    Withdraw(token, msg.sender, amount, tokens[token][msg.sender]);
    return true;
  }

  function adminWithdraw(address token, uint256 amount, address user, address target, bool authorizeArbitraryFee, uint256 nonce, uint8 v, bytes32 r, bytes32 s, uint256 feeWithdrawal) onlyAdmin returns (bool success) {
    require(target != 0x0);
    bytes32 hash = keccak256(this, token, amount, user, target, authorizeArbitraryFee, nonce);
    if (withdrawn[hash]) throw;
    withdrawn[hash] = true;
    if (ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash), v, r, s) != user) throw;
    if (feeWithdrawal > 100 finney && !authorizeArbitraryFee) feeWithdrawal = 100 finney;
    require(feeWithdrawal <= 1 ether);
    if (tokens[token][user] < amount) throw;
    tokens[token][user] = safeSub(tokens[token][user], amount);
    uint256 fee = safeMul(feeWithdrawal, amount) / 1 ether;
    tokens[token][feeAccount] = safeAdd(tokens[token][feeAccount], fee);
    amount = amount - fee;
    protectedFunds[token] = safeSub(protectedFunds[token], amount);
    if (token == address(0)) {
      if (!target.send(amount)) throw;
    } else {
      if (!Token(token).transfer(target, amount)) throw;
    }
    lastActiveTransaction[user][token] = block.number;
  }
  function adminWithdrawEIP777(address token, uint256 amount, address user, address target, bool authorizeArbitraryFee, uint256 nonce, uint8 v, bytes32 r, bytes32 s, uint256 feeWithdrawal) onlyAdmin returns (bool success) {
    require(target != 0x0);
    bytes32 hash = keccak256(this, token, amount, user, target, authorizeArbitraryFee, nonce);
    if (withdrawn[hash]) throw;
    withdrawn[hash] = true;
    if (ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash), v, r, s) != user) throw;
    if (feeWithdrawal > 100 finney && !authorizeArbitraryFee) feeWithdrawal = 100 finney;
    require(feeWithdrawal <= 1 ether);
    if (tokens[token][user] < amount) throw;
    tokens[token][user] = safeSub(tokens[token][user], amount);
    uint256 fee = safeMul(feeWithdrawal, amount) / 1 ether;
    tokens[token][feeAccount] = safeAdd(tokens[token][feeAccount], fee);
    amount = amount - fee;
    amount = amount - (amount % EIP777(token).granularity());
    protectedFunds[token] = safeSub(protectedFunds[token], amount);
    EIP777(token).send(target, amount);
    lastActiveTransaction[user][token] = block.number;
  }
  function transfer(address token, uint256 amount, address user, address target, uint256 nonce, uint8 v, bytes32 r, bytes32 s, uint256 feeTransfer) onlyAdmin returns (bool success) {
    require(target != 0x0);
    bytes32 hash = keccak256(TRANSFER_SALT, keccak256(this, token, amount, user, target, nonce));
    if (transferred[hash]) throw;
    transferred[hash] = true;
    if (ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash), v, r, s) != user) throw;
    if (feeTransfer > 100 finney) feeTransfer = 100 finney;
    if (tokens[token][user] < amount) throw;
    tokens[token][user] = safeSub(tokens[token][user], amount);
    uint256 fee = safeMul(feeTransfer, amount) / 1 ether;
    tokens[token][feeAccount] = safeAdd(tokens[token][feeAccount], fee);
    amount = amount - fee;
    tokens[token][target] = safeAdd(tokens[token][target], amount);
    lastActiveTransaction[user][token] = block.number;
    lastActiveTransaction[target][token] = block.number;
    Transfer(token, target);
  }
  function trade(uint256[8] tradeValues, address[4] tradeAddresses, uint8[2] v, bytes32[4] rs) onlyAdmin returns (bool success) {
    /* amount is in amountBuy terms */
    /* tradeValues
       [0] amountBuy
       [1] amountSell
       [2] expires
       [3] nonce
       [4] amount
       [5] tradeNonce
       [6] feeMake
       [7] feeTake
     tradeAddressses
       [0] tokenBuy
       [1] tokenSell
       [2] maker
       [3] taker
     */
    if (invalidOrder[tradeAddresses[2]] > tradeValues[3]) throw;
    bytes32 orderHash = keccak256(this, tradeAddresses[0], tradeValues[0], tradeAddresses[1], tradeValues[1], tradeValues[2], tradeValues[3], tradeAddresses[2]);
    if (ecrecover(keccak256("\x19Ethereum Signed Message:\n32", orderHash), v[0], rs[0], rs[1]) != tradeAddresses[2]) throw;
    bytes32 tradeHash = keccak256(orderHash, tradeValues[4], tradeAddresses[3], tradeValues[5]); 
    if (ecrecover(keccak256("\x19Ethereum Signed Message:\n32", tradeHash), v[1], rs[2], rs[3]) != tradeAddresses[3]) throw;
    if (traded[tradeHash]) throw;
    traded[tradeHash] = true;
    if (tradeValues[6] > 10 finney) tradeValues[6] = 10 finney;
    if (tradeValues[7] > 1 ether) tradeValues[7] = 1 ether;
    if (safeAdd(orderFills[orderHash], tradeValues[4]) > tradeValues[0]) throw;
    if (tokens[tradeAddresses[0]][tradeAddresses[3]] < tradeValues[4]) throw;
    if (tokens[tradeAddresses[1]][tradeAddresses[2]] < (safeMul(tradeValues[1], tradeValues[4]) / tradeValues[0])) throw;
    tokens[tradeAddresses[0]][tradeAddresses[3]] = safeSub(tokens[tradeAddresses[0]][tradeAddresses[3]], tradeValues[4]);
    uint256 makerFee = safeMul(tradeValues[4], tradeValues[6]) / 1 ether;
    tokens[tradeAddresses[0]][tradeAddresses[2]] = safeAdd(tokens[tradeAddresses[0]][tradeAddresses[2]], tradeValues[4] - makerFee);
    tokens[tradeAddresses[0]][feeAccount] = safeAdd(tokens[tradeAddresses[0]][feeAccount], makerFee);
    tokens[tradeAddresses[1]][tradeAddresses[2]] = safeSub(tokens[tradeAddresses[1]][tradeAddresses[2]], safeMul(tradeValues[1], tradeValues[4]) / tradeValues[0]);
    uint256 amountSellAdjusted = safeMul(tradeValues[1], tradeValues[4]) / tradeValues[0];
    uint256 takerFee = safeMul(tradeValues[7], amountSellAdjusted) / 1 ether;
    tokens[tradeAddresses[1]][tradeAddresses[3]] = safeAdd(tokens[tradeAddresses[1]][tradeAddresses[3]], safeSub(amountSellAdjusted, takerFee));
    tokens[tradeAddresses[1]][feeAccount] = safeAdd(tokens[tradeAddresses[1]][feeAccount], takerFee);
    orderFills[orderHash] = safeAdd(orderFills[orderHash], tradeValues[4]);
    lastActiveTransaction[tradeAddresses[2]][tradeAddresses[0]] = block.number;
    lastActiveTransaction[tradeAddresses[2]][tradeAddresses[1]] = block.number;
    lastActiveTransaction[tradeAddresses[3]][tradeAddresses[0]] = block.number;
    lastActiveTransaction[tradeAddresses[3]][tradeAddresses[1]] = block.number;
    Trade(tradeAddresses[0], tradeAddresses[1], tradeAddresses[2], tradeAddresses[3], tradeValues[4], orderHash);
  }

  function() external {
    throw;
  }
}
