const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";

const POOL = "0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);

  console.log("Connecting...");
  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());

  console.log("\nChecking pool address...");
  console.log("Pool:", POOL);

  const code = await provider.getCode(POOL);

  if (code === "0x") {
    throw new Error("No contract exists at this address");
  }

  console.log("Contract code found.");
  console.log("Bytecode length:", code.length);

  const balance = await provider.getBalance(POOL);

  console.log(
    "Native ETH balance:",
    ethers.formatEther(balance)
  );

  console.log("\nKnown infrastructure:");
  console.log(
    "NVDA:",
    "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"
  );

  console.log(
    "V4 Quoter:",
    "0x8dc178efb8111bb0973dd9d722ebeff267c98f94"
  );

  console.log(
    "Universal Router:",
    "0x8876789976decbfcbbbe364623c63652db8c0904"
  );

  console.log(
    "PoolManager:",
    "0x8366a39cc670b4001a1121b8f6a443a643e40951"
  );

  console.log("\nPool contract successfully detected.");
}

main().catch(error => {
  console.error("\nERROR:");
  console.error(error);
});