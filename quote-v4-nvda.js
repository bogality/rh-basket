const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";

const USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const NVDA =
  "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";

const HOOK =
  "0x66622f77B797D506e5376F7798b67ab288966080";

const POOL_ID =
  "0x7990aad9e8fb048f49a155a7df5603db0366f0657035b78eb4196395cccb3dcd";

const QUOTER =
  "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";

// Dynamic fee flag
const DYNAMIC_FEE = 8388608;

// Fables pool configuration we recovered onchain
const POOL_KEY = {
  currency0: USDG,
  currency1: NVDA,
  fee: DYNAMIC_FEE,
  tickSpacing: 10,
  hooks: HOOK
};

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

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);

  console.log("Connecting to Robinhood Chain...");

  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());

  // USDG is currency0 and NVDA is currency1.
  const zeroForOne = true;

  console.log("\nReading Fables dynamic fee...");

  const hook = new ethers.Contract(
    HOOK,
    HOOK_ABI,
    provider
  );

  const currentFee = await hook.currentFee(
    POOL_ID,
    zeroForOne
  );

  console.log("Raw current fee:", currentFee.toString());

  /*
    Uniswap fees are expressed in hundredths
    of a basis point.

    100 = 0.01%
    400 = 0.04%
    3000 = 0.30%
  */

  const feePercent = Number(currentFee) / 10000;

  console.log(
    "Current USDG -> NVDA fee:",
    feePercent.toFixed(4) + "%"
  );

  const amountIn = ethers.parseUnits("10", 6);

  console.log("\n============================");
  console.log("QUOTE REQUEST");
  console.log("============================");

  console.log("Input: 10 USDG");
  console.log("Output: NVDA");
  console.log("zeroForOne:", zeroForOne);
  console.log("Pool ID:", POOL_ID);

  const quoter = new ethers.Contract(
    QUOTER,
    QUOTER_ABI,
    provider
  );

  console.log("\nRequesting V4 quote...");

  const result =
    await quoter.quoteExactInputSingle.staticCall({
      poolKey: POOL_KEY,
      zeroForOne: zeroForOne,
      exactAmount: amountIn,
      hookData: "0x"
    });

  const amountOut = result.amountOut;
  const gasEstimate = result.gasEstimate;

  const nvdaOut = ethers.formatUnits(
    amountOut,
    18
  );

  const impliedPrice =
    10 / Number(nvdaOut);

  console.log("\n============================");
  console.log("LIVE V4 QUOTE");
  console.log("============================");

  console.log("Spend:");
  console.log("10 USDG");

  console.log("\nReceive:");
  console.log(nvdaOut, "NVDA");

  console.log("\nImplied execution price:");
  console.log(
    impliedPrice.toFixed(4),
    "USDG per NVDA"
  );

  console.log("\nDynamic fee:");
  console.log(
    currentFee.toString(),
    "=",
    feePercent.toFixed(4) + "%"
  );

  console.log("\nQuoter gas estimate:");
  console.log(gasEstimate.toString());

  console.log("\n============================");
  console.log("NO TRANSACTION WAS SENT.");
}

main().catch(error => {
  console.error("\nERROR:");
  console.error(error);
});