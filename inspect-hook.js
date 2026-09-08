const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";

const HOOK =
  "0x66622f77B797D506e5376F7798b67ab288966080";

// Uniswap V4 hook permission bits
const FLAGS = [
  { name: "beforeInitialize", bit: 13 },
  { name: "afterInitialize", bit: 12 },
  { name: "beforeAddLiquidity", bit: 11 },
  { name: "afterAddLiquidity", bit: 10 },
  { name: "beforeRemoveLiquidity", bit: 9 },
  { name: "afterRemoveLiquidity", bit: 8 },
  { name: "beforeSwap", bit: 7 },
  { name: "afterSwap", bit: 6 },
  { name: "beforeDonate", bit: 5 },
  { name: "afterDonate", bit: 4 },
  { name: "beforeSwapReturnDelta", bit: 3 },
  { name: "afterSwapReturnDelta", bit: 2 },
  { name: "afterAddLiquidityReturnDelta", bit: 1 },
  { name: "afterRemoveLiquidityReturnDelta", bit: 0 }
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);

  console.log("Connecting to Robinhood Chain...");

  const network = await provider.getNetwork();
  console.log("Chain ID:", network.chainId.toString());

  console.log("\nHook:");
  console.log(HOOK);

  const code = await provider.getCode(HOOK);

  console.log("\nContract code present:", code !== "0x");
  console.log("Bytecode length:", code.length);

  /*
    V4 uses the lowest 14 bits of the hook address
    as its permission bitmap.
  */

  const hookNumber = BigInt(HOOK);

  const mask14 = (1n << 14n) - 1n;
  const permissionBits = hookNumber & mask14;

  console.log("\n============================");
  console.log("HOOK PERMISSIONS");
  console.log("============================");

  console.log(
    "Low 14 bits:",
    "0x" + permissionBits.toString(16).padStart(4, "0")
  );

  let enabled = [];

  for (const flag of FLAGS) {
    const active =
      (permissionBits & (1n << BigInt(flag.bit))) !== 0n;

    console.log(
      `${flag.name.padEnd(34)} ${active ? "YES" : "no"}`
    );

    if (active) {
      enabled.push(flag.name);
    }
  }

  console.log("\n============================");
  console.log("ENABLED HOOKS");
  console.log("============================");

  if (enabled.length === 0) {
    console.log("None");
  } else {
    for (const name of enabled) {
      console.log("-", name);
    }
  }

  /*
    Dynamic-fee pools commonly interact with hooks
    around swap execution, but the permission bitmap
    alone does NOT tell us the fee formula.
  */

  console.log("\nInterpretation:");

  if (enabled.includes("beforeSwap")) {
    console.log(
      "- Hook executes logic BEFORE swaps."
    );
  }

  if (enabled.includes("afterSwap")) {
    console.log(
      "- Hook executes logic AFTER swaps."
    );
  }

  if (enabled.includes("beforeSwapReturnDelta")) {
    console.log(
      "- beforeSwap may alter the swap accounting delta."
    );
  }

  if (enabled.includes("afterSwapReturnDelta")) {
    console.log(
      "- afterSwap may alter the swap accounting delta."
    );
  }

  if (
    enabled.includes("beforeAddLiquidity") ||
    enabled.includes("afterAddLiquidity")
  ) {
    console.log(
      "- Hook also participates in liquidity changes."
    );
  }

  console.log("\nNO TRANSACTION WAS SENT.");
}

main().catch(error => {
  console.error("\nERROR:");
  console.error(error);
});