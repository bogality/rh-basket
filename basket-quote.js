const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";

// Fables onchain pool registry
const REGISTRY =
  "0x159a113e012593d9b3cc63ad45e30f0467e13ef3";

// Official Uniswap V4 Quoter on Robinhood Chain
const QUOTER =
  "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";

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

const HOOK_ABI = [
  "function currentFee(bytes32 poolId, bool zeroForOne) view returns (uint24)"
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

// Our first test basket.
const BASKET = [
  { symbol: "NVDA", weight: 40 },
  { symbol: "SPY",  weight: 35 },
  { symbol: "AAPL", weight: 25 }
];

const TOTAL_USDG = 100;

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
  const provider = new ethers.JsonRpcProvider(RPC);

  console.log("Connecting to Robinhood Chain...");

  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());

  if (network.chainId !== 4663n) {
    throw new Error("Wrong network");
  }

  console.log("\nReading active Fables pools...");

  const registry = new ethers.Contract(
    REGISTRY,
    REGISTRY_ABI,
    provider
  );

  const pools = await registry.activePools();

  console.log("Active pools found:", pools.length);

  /*
    Build a list of active USDG pools.

    We read the actual token symbols directly from chain
    rather than maintain our own token-address list.
  */

  const usdGPools = [];

  console.log("\nDiscovering USDG stock pools...");

  for (const pool of pools) {
    const key = pool.key;

    const c0 = key.currency0.toLowerCase();
    const c1 = key.currency1.toLowerCase();
    const usdg = USDG.toLowerCase();

    if (c0 !== usdg && c1 !== usdg) {
      continue;
    }

    const otherAddress =
      c0 === usdg
        ? key.currency1
        : key.currency0;

    try {
      const info =
        await tokenInfo(provider, otherAddress);

      usdGPools.push({
        id: pool.id,
        key,
        token: info
      });

      console.log(
        "-",
        info.symbol,
        "| Pool:",
        pool.id
      );
    } catch (e) {
      // Ignore nonstandard tokens for this experiment.
    }
  }

  console.log("\n============================");
  console.log("BASKET");
  console.log("============================");

  console.log("Total input:", TOTAL_USDG, "USDG");

  for (const item of BASKET) {
    console.log(
      `${item.symbol}: ${item.weight}%`
    );
  }

  const totalWeight =
    BASKET.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight !== 100) {
    throw new Error(
      `Basket weights equal ${totalWeight}%, not 100%.`
    );
  }

  const quoter = new ethers.Contract(
    QUOTER,
    QUOTER_ABI,
    provider
  );

  const results = [];

  console.log("\n============================");
  console.log("LIVE V4 QUOTES");
  console.log("============================");

  for (const item of BASKET) {

    const pool = usdGPools.find(
      p => p.token.symbol.toUpperCase() === item.symbol
    );

    if (!pool) {
      console.log(
        `\n${item.symbol}: NO ACTIVE FABLES USDG POOL FOUND`
      );

      continue;
    }

    const allocation =
      TOTAL_USDG * item.weight / 100;

    const key = pool.key;

    /*
      Determine swap direction.

      USDG -> stock

      If USDG is currency0:
        zeroForOne = true

      If USDG is currency1:
        zeroForOne = false
    */

    const zeroForOne =
      key.currency0.toLowerCase() ===
      USDG.toLowerCase();

    const hook = new ethers.Contract(
      key.hooks,
      HOOK_ABI,
      provider
    );

    const currentFee =
      await hook.currentFee(
        pool.id,
        zeroForOne
      );

    const feePercent =
      Number(currentFee) / 10000;

    const amountIn =
      ethers.parseUnits(
        allocation.toFixed(6),
        6
      );

    console.log(`\n${item.symbol}`);
    console.log("----------------------------");
    console.log("Allocation:", allocation, "USDG");
    console.log("Pool:", pool.id);
    console.log(
      "Dynamic fee:",
      currentFee.toString(),
      "=",
      feePercent.toFixed(4) + "%"
    );

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

    const amountOut = quote.amountOut;

    const formattedOut =
      ethers.formatUnits(
        amountOut,
        pool.token.decimals
      );

    const impliedPrice =
      allocation / Number(formattedOut);

    console.log(
      "Receive:",
      formattedOut,
      item.symbol
    );

    console.log(
      "Implied execution price:",
      impliedPrice.toFixed(4),
      "USDG"
    );

    console.log(
      "Gas estimate:",
      quote.gasEstimate.toString()
    );

    results.push({
      symbol: item.symbol,
      allocation,
      output: formattedOut,
      price: impliedPrice,
      fee: feePercent,
      gas: BigInt(quote.gasEstimate)
    });
  }

  console.log("\n============================");
  console.log("BASKET SUMMARY");
  console.log("============================");

  let totalGas = 0n;

  for (const result of results) {
    totalGas += result.gas;

    console.log(
      `${result.symbol.padEnd(5)} | ` +
      `$${result.allocation.toFixed(2)} USDG -> ` +
      `${Number(result.output).toFixed(8)} ${result.symbol}`
    );
  }

  console.log("\nQuoted legs:", results.length);
  console.log("Total input:", TOTAL_USDG, "USDG");
  console.log(
    "Combined individual gas estimates:",
    totalGas.toString()
  );

  console.log("\nNO TRANSACTION WAS SENT.");
}

main().catch(error => {
  console.error("\nERROR:");
  console.error(error);
});