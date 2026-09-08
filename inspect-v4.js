const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";

const POOL_MANAGER =
  "0x8366a39cc670b4001a1121b8f6a443a643e40951";

const TARGET_POOL_ID =
  "0x7990aad9e8fb048f49a155a7df5603db0366f0657035b78eb4196395cccb3dcd";

const NVDA =
  "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";

const USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const POOL_MANAGER_ABI = [
  `event Initialize(
    bytes32 indexed id,
    address indexed currency0,
    address indexed currency1,
    uint24 fee,
    int24 tickSpacing,
    address hooks,
    uint160 sqrtPriceX96,
    int24 tick
  )`
];

async function describeToken(provider, address) {
  if (address === ethers.ZeroAddress) {
    return {
      address,
      symbol: "ETH",
      decimals: 18
    };
  }

  const token = new ethers.Contract(
    address,
    ERC20_ABI,
    provider
  );

  let symbol = "UNKNOWN";
  let decimals = "?";

  try {
    symbol = await token.symbol();
  } catch {}

  try {
    decimals = (await token.decimals()).toString();
  } catch {}

  return { address, symbol, decimals };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);

  console.log("Connecting to Robinhood Chain...");

  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());

  console.log("\nTarget V4 pool:");
  console.log(TARGET_POOL_ID);

  const manager = new ethers.Contract(
    POOL_MANAGER,
    POOL_MANAGER_ABI,
    provider
  );

  const initializeEvent =
    manager.interface.getEvent("Initialize");

  const topic0 =
    initializeEvent.topicHash;

  console.log("\nSearching PoolManager Initialize events...");

  const latestBlock = await provider.getBlockNumber();

  console.log("Latest block:", latestBlock);

  /*
    The pool ID is indexed, so we can search directly
    for the exact Initialize event without scanning
    every V4 pool.
  */

  const logs = await provider.getLogs({
    address: POOL_MANAGER,
    fromBlock: 0,
    toBlock: "latest",
    topics: [
      topic0,
      TARGET_POOL_ID
    ]
  });

  if (logs.length === 0) {
    throw new Error(
      "No Initialize event found for this pool ID."
    );
  }

  console.log(
    "Initialize event found:",
    logs.length
  );

  const log = logs[0];

  const parsed =
    manager.interface.parseLog(log);

  const {
    id,
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
    sqrtPriceX96,
    tick
  } = parsed.args;

  const token0 =
    await describeToken(provider, currency0);

  const token1 =
    await describeToken(provider, currency1);

  console.log("\n============================");
  console.log("V4 POOL KEY");
  console.log("============================");

  console.log("\nPool ID:");
  console.log(id);

  console.log("\nCurrency 0:");
  console.log(token0.symbol);
  console.log(token0.address);
  console.log("Decimals:", token0.decimals);

  console.log("\nCurrency 1:");
  console.log(token1.symbol);
  console.log(token1.address);
  console.log("Decimals:", token1.decimals);

  console.log("\nFee:");
  console.log(fee.toString());

  console.log(
    "Fee percentage:",
    (Number(fee) / 10000).toString() + "%"
  );

  console.log("\nTick spacing:");
  console.log(tickSpacing.toString());

  console.log("\nHook address:");
  console.log(hooks);

  if (hooks === ethers.ZeroAddress) {
    console.log("Hook: NONE");
  } else {
    const hookCode =
      await provider.getCode(hooks);

    console.log(
      "Hook contract detected:",
      hookCode !== "0x"
    );

    console.log(
      "Hook bytecode length:",
      hookCode.length
    );
  }

  console.log("\nInitial sqrtPriceX96:");
  console.log(sqrtPriceX96.toString());

  console.log("\nInitial tick:");
  console.log(tick.toString());

  console.log("\nCreated in block:");
  console.log(log.blockNumber);

  console.log("\nTransaction:");
  console.log(log.transactionHash);

  console.log("\n============================");

  const currencies = [
    currency0.toLowerCase(),
    currency1.toLowerCase()
  ];

  const expected = [
    NVDA.toLowerCase(),
    USDG.toLowerCase()
  ];

  const pairMatches =
    expected.every(x => currencies.includes(x));

  console.log(
    "Matches NVDA/USDG:",
    pairMatches
  );

  console.log("\nNO TRANSACTION WAS SENT.");
}

main().catch(error => {
  console.error("\nERROR:");
  console.error(error);
});