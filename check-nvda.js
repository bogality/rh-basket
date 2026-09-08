const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const ASSETS_API = "https://api.robinhood.com/rhj/assets";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)"
];

async function main() {
  console.log("Connecting to Robinhood Chain...");

  const provider = new ethers.JsonRpcProvider(RPC);

  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());

  if (network.chainId !== 4663n) {
    throw new Error("Wrong network");
  }

  console.log("\nFetching Robinhood canonical Stock Token registry...");

  const response = await fetch(ASSETS_API);
  const data = await response.json();

  const nvda = data.assets.find(
    asset => asset.tokenSymbol === "NVDA"
  );

  if (!nvda) {
    throw new Error("NVDA not found in Robinhood registry");
  }

  const deployment = nvda.deployments.find(
    d => d.chainId === 4663
  );

  if (!deployment) {
    throw new Error("NVDA not deployed on Robinhood Chain");
  }

  const address = deployment.contractAddress;

  console.log("\nRobinhood Registry:");
  console.log("Symbol:", nvda.tokenSymbol);
  console.log("Name:", nvda.tokenName);
  console.log("Contract:", address);
  console.log("Multiplier:", nvda.currentMultiplier);
  console.log("Status:", nvda.status);

  console.log("\nReading token directly from chain...");

  const token = new ethers.Contract(
    address,
    ERC20_ABI,
    provider
  );

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
    token.totalSupply()
  ]);

  console.log("\nOnchain:");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals.toString());
  console.log(
    "Total supply:",
    ethers.formatUnits(totalSupply, decimals)
  );

  console.log("\nNVDA token successfully verified.");
}

main().catch(error => {
  console.error("\nERROR");
  console.error(error);
});