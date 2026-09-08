const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";

const WALLET =
  "0xbc9ca263a8a6872ddF808478ae9e0be14832e5b7";

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
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"
];

const V4_SWAP = 0x10;

const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

// 0.50% max slippage
const SLIPPAGE_BPS = 50n;
const BPS = 10000n;

const BASKET = [
  { symbol: "NVDA", amount: "1" },
  { symbol: "SPY",  amount: "1" },
  { symbol: "AAPL", amount: "1" }
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
    address,
    symbol,
    decimals: Number(decimals)
  };
}

async function main() {
  const provider =
    new ethers.JsonRpcProvider(RPC);

  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());
  console.log("Simulating from:", WALLET);

  console.log("\nLoading active Fables pools...");

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

  let commands = "0x";
  const inputs = [];

  console.log("\n============================");
  console.log("$3 BASKET");
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

    const minAmountOut =
      quote.amountOut *
      (BPS - SLIPPAGE_BPS) /
      BPS;

    console.log(`\n${leg.symbol}`);
    console.log("Input:", leg.amount, "USDG");
    console.log(
      "Quote:",
      ethers.formatUnits(
        quote.amountOut,
        pool.token.decimals
      ),
      leg.symbol
    );

    console.log(
      "Minimum:",
      ethers.formatUnits(
        minAmountOut,
        pool.token.decimals
      ),
      leg.symbol
    );

    /*
      Current documented ExactInputSingleParams:
        PoolKey
        bool zeroForOne
        uint128 amountIn
        uint128 amountOutMinimum
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

    commands +=
      V4_SWAP
        .toString(16)
        .padStart(2, "0");

    inputs.push(v4Input);
  }

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
  console.log("SIMULATING COMPLETE TX");
  console.log("============================");

  console.log("Router:", UNIVERSAL_ROUTER);
  console.log("Commands:", commands);
  console.log("Total USDG input: 3");
  console.log("ETH value: 0");

  /*
    provider.call performs an eth_call.

    The RPC evaluates the transaction as though
    WALLET submitted it, but nothing is signed,
    mined, or broadcast.
  */

  try {
    const result = await provider.call({
      from: WALLET,
      to: UNIVERSAL_ROUTER,
      data: calldata,
      value: 0
    });

    console.log("\n✅ SIMULATION SUCCESSFUL");
    console.log("Returned data:", result);

    console.log(
      "\nThe router accepted the complete 3-leg basket"
    );

    console.log(
      "using the wallet's existing Permit2 approvals."
    );

  } catch (error) {

    console.log("\n❌ SIMULATION FAILED");

    console.log(
      "Short message:",
      error.shortMessage || error.message
    );

    if (error.data) {
      console.log("Revert data:", error.data);
    }

    if (error.info?.error?.data) {
      console.log(
        "RPC revert data:",
        error.info.error.data
      );
    }

    throw error;
  }

  console.log("\n============================");
  console.log("NOTHING WAS SENT");
  console.log("============================");

  console.log("No private key was used.");
  console.log("No transaction was signed.");
  console.log("No USDG was spent.");
  console.log("No stock tokens were received.");
}

main().catch(error => {
  console.error("\nFinished with an error.");
});