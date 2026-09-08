const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";

const REGISTRY =
  "0x159a113e012593d9b3cc63ad45e30f0467e13ef3";

const QUOTER =
  "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";

const UNIVERSAL_ROUTER =
  "0x8876789976decbfcbbbe364623c63652db8c0904";

const USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const REGISTRY_ABI = [
  `function activePools()
    view
    returns (
      tuple(
        tuple(
          address currency0,
          address currency1,
          uint24 fee,
          int24 tickSpacing,
          address hooks
        ) key,
        bytes32 id,
        bool active
      )[]
    )`
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const QUOTER_ABI = [
  `function quoteExactInputSingle(
    tuple(
      tuple(
        address currency0,
        address currency1,
        uint24 fee,
        int24 tickSpacing,
        address hooks
      ) poolKey,
      bool zeroForOne,
      uint128 exactAmount,
      bytes hookData
    ) params
  )
  returns (
    uint256 amountOut,
    uint256 gasEstimate
  )`
];

const ROUTER_ABI = [
  `function execute(
    bytes commands,
    bytes[] inputs,
    uint256 deadline
  ) payable`
];

// Universal Router command
const V4_SWAP = 0x10;

// V4 Router action IDs
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

// 0.50% slippage for this encoding test
const SLIPPAGE_BPS = 50n;
const BPS = 10000n;

const BASKET = [
  { symbol: "NVDA", amount: "40" },
  { symbol: "SPY", amount: "35" },
  { symbol: "AAPL", amount: "25" }
];

const abi = ethers.AbiCoder.defaultAbiCoder();

async function tokenInfo(provider, address) {
  const token = new ethers.Contract(
    address,
    ERC20_ABI,
    provider
  );

  const [symbol, decimals] = await Promise.all([
    token.symbol(),
    token.decimals()
  ]);

  return {
    symbol,
    decimals: Number(decimals),
    address
  };
}

async function main() {
  const provider =
    new ethers.JsonRpcProvider(RPC);

  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());

  if (network.chainId !== 4663n) {
    throw new Error("Wrong network");
  }

  console.log("\nLoading Fables pools...");

  const registry = new ethers.Contract(
    REGISTRY,
    REGISTRY_ABI,
    provider
  );

  const pools = await registry.activePools();

  const discovered = [];

  for (const pool of pools) {
    const key = pool.key;

    const c0 = key.currency0.toLowerCase();
    const c1 = key.currency1.toLowerCase();

    if (
      c0 !== USDG.toLowerCase() &&
      c1 !== USDG.toLowerCase()
    ) {
      continue;
    }

    const stockAddress =
      c0 === USDG.toLowerCase()
        ? key.currency1
        : key.currency0;

    try {
      const info =
        await tokenInfo(provider, stockAddress);

      discovered.push({
        id: pool.id,
        key,
        token: info
      });
    } catch {}
  }

  const quoter = new ethers.Contract(
    QUOTER,
    QUOTER_ABI,
    provider
  );

  /*
    We'll use one V4_SWAP Universal Router command
    per basket leg.

    Each V4_SWAP contains:
      SWAP_EXACT_IN_SINGLE
      SETTLE_ALL
      TAKE_ALL
  */

  let commands = "0x";
  const inputs = [];

  console.log("\n============================");
  console.log("BUILDING UNSIGNED BASKET");
  console.log("============================");

  for (const leg of BASKET) {

    const pool = discovered.find(
      p =>
        p.token.symbol.toUpperCase() ===
        leg.symbol
    );

    if (!pool) {
      throw new Error(
        `No USDG pool found for ${leg.symbol}`
      );
    }

    const key = pool.key;

    const zeroForOne =
      key.currency0.toLowerCase() ===
      USDG.toLowerCase();

    const amountIn =
      ethers.parseUnits(leg.amount, 6);

    const quote =
      await quoter.quoteExactInputSingle.staticCall({
        poolKey: {
          currency0: key.currency0,
          currency1: key.currency1,
          fee: key.fee,
          tickSpacing: key.tickSpacing,
          hooks: key.hooks
        },
        zeroForOne,
        exactAmount: amountIn,
        hookData: "0x"
      });

    const quotedOut =
      quote.amountOut;

    const minAmountOut =
      quotedOut *
      (BPS - SLIPPAGE_BPS) /
      BPS;

    console.log(`\n${leg.symbol}`);
    console.log("----------------------------");
    console.log("Input:", leg.amount, "USDG");

    console.log(
      "Quoted output:",
      ethers.formatUnits(
        quotedOut,
        pool.token.decimals
      ),
      leg.symbol
    );

    console.log(
      "Minimum output (0.50% slippage):",
      ethers.formatUnits(
        minAmountOut,
        pool.token.decimals
      ),
      leg.symbol
    );

    /*
      ExactInputSingleParams:

      PoolKey poolKey
      bool zeroForOne
      uint128 amountIn
      uint128 amountOutMinimum
      uint256 minHopPriceX36
      bytes hookData
    */

    const swapParam = abi.encode(
      [
        `tuple(
          tuple(
            address currency0,
            address currency1,
            uint24 fee,
            int24 tickSpacing,
            address hooks
          ) poolKey,
          bool zeroForOne,
          uint128 amountIn,
          uint128 amountOutMinimum,
          uint256 minHopPriceX36,
          bytes hookData
        )`
      ],
      [
        {
          poolKey: {
            currency0: key.currency0,
            currency1: key.currency1,
            fee: key.fee,
            tickSpacing: key.tickSpacing,
            hooks: key.hooks
          },
          zeroForOne,
          amountIn,
          amountOutMinimum: minAmountOut,

          // Disabled for first encoding test
          minHopPriceX36: 0,

          hookData: "0x"
        }
      ]
    );

    const inputCurrency =
      zeroForOne
        ? key.currency0
        : key.currency1;

    const outputCurrency =
      zeroForOne
        ? key.currency1
        : key.currency0;

    const settleParam = abi.encode(
      ["address", "uint256"],
      [inputCurrency, amountIn]
    );

    const takeParam = abi.encode(
      ["address", "uint256"],
      [outputCurrency, minAmountOut]
    );

    /*
      V4 actions:

      06 = SWAP_EXACT_IN_SINGLE
      0c = SETTLE_ALL
      0f = TAKE_ALL
    */

    const actions = ethers.hexlify(
      Uint8Array.from([
        SWAP_EXACT_IN_SINGLE,
        SETTLE_ALL,
        TAKE_ALL
      ])
    );

    const v4Input = abi.encode(
      ["bytes", "bytes[]"],
      [
        actions,
        [
          swapParam,
          settleParam,
          takeParam
        ]
      ]
    );

    // Add one Universal Router V4_SWAP command.
    commands +=
      V4_SWAP
        .toString(16)
        .padStart(2, "0");

    inputs.push(v4Input);
  }

  /*
    This deadline is ONLY for encoding/display.
    We're not broadcasting this transaction.

    Give it one hour from the current time.
  */

  const deadline =
    Math.floor(Date.now() / 1000) + 3600;

  const routerInterface =
    new ethers.Interface(ROUTER_ABI);

  const calldata =
    routerInterface.encodeFunctionData(
      "execute",
      [
        commands,
        inputs,
        deadline
      ]
    );

  console.log("\n============================");
  console.log("UNSIGNED UNIVERSAL ROUTER TX");
  console.log("============================");

  console.log("\nTo:");
  console.log(UNIVERSAL_ROUTER);

  console.log("\nValue:");
  console.log("0 ETH");

  console.log("\nCommands:");
  console.log(commands);

  console.log(
    "\nExpected commands:",
    BASKET.length,
    "x V4_SWAP"
  );

  console.log("\nDeadline:");
  console.log(deadline);

  console.log("\nCalldata bytes:");
  console.log(
    (calldata.length - 2) / 2
  );

  console.log("\nCalldata:");
  console.log(calldata);

  console.log("\n============================");
  console.log("IMPORTANT");
  console.log("============================");

  console.log(
    "This transaction was ONLY encoded locally."
  );

  console.log(
    "No wallet was connected."
  );

  console.log(
    "No approval was granted."
  );

  console.log(
    "No transaction was signed."
  );

  console.log(
    "Nothing was broadcast."
  );
}

main().catch(error => {
  console.error("\nERROR:");
  console.error(error);
});