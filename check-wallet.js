const { ethers } = require("ethers");

const RPC = "https://rpc.mainnet.chain.robinhood.com";

const USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const PERMIT2 =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const UNIVERSAL_ROUTER =
  "0x8876789976decbfcbbbe364623c63652db8c0904";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const PERMIT2_ABI = [
  `function allowance(
    address owner,
    address token,
    address spender
  )
  view
  returns (
    uint160 amount,
    uint48 expiration,
    uint48 nonce
  )`
];

async function main() {
  const walletArg = process.argv[2];

  if (!walletArg) {
    throw new Error(
      "Provide your PUBLIC wallet address after the filename."
    );
  }

  const wallet = ethers.getAddress(walletArg);

  const provider = new ethers.JsonRpcProvider(RPC);

  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());
  console.log("Wallet:", wallet);

  const usdg = new ethers.Contract(
    USDG,
    ERC20_ABI,
    provider
  );

  const permit2 = new ethers.Contract(
    PERMIT2,
    PERMIT2_ABI,
    provider
  );

  const [
    decimals,
    symbol,
    usdgBalance,
    ethBalance,
    erc20Allowance,
    permit2Allowance
  ] = await Promise.all([
    usdg.decimals(),
    usdg.symbol(),
    usdg.balanceOf(wallet),
    provider.getBalance(wallet),
    usdg.allowance(wallet, PERMIT2),
    permit2.allowance(
      wallet,
      USDG,
      UNIVERSAL_ROUTER
    )
  ]);

  console.log("\n============================");
  console.log("WALLET STATUS");
  console.log("============================");

  console.log(
    "\nETH balance:",
    ethers.formatEther(ethBalance),
    "ETH"
  );

  console.log(
    "\nUSDG balance:",
    ethers.formatUnits(usdgBalance, decimals),
    symbol
  );

  console.log("\n1. USDG -> Permit2 allowance:");

  console.log(
    ethers.formatUnits(
      erc20Allowance,
      decimals
    ),
    "USDG"
  );

  console.log("\n2. Permit2 -> Universal Router:");

  console.log(
    "Amount:",
    ethers.formatUnits(
      permit2Allowance.amount,
      decimals
    ),
    "USDG"
  );

  const expiration =
    Number(permit2Allowance.expiration);

  console.log(
    "Expiration:",
    expiration === 0
      ? "NONE"
      : new Date(expiration * 1000).toISOString()
  );

  console.log(
    "Nonce:",
    permit2Allowance.nonce.toString()
  );

  console.log("\n============================");
  console.log("100 USDG BASKET READINESS");
  console.log("============================");

  const required =
    ethers.parseUnits("100", decimals);

  const hasBalance =
    usdgBalance >= required;

  const erc20Approved =
    erc20Allowance >= required;

  const now =
    Math.floor(Date.now() / 1000);

  const permit2Approved =
    permit2Allowance.amount >= required &&
    expiration > now;

  console.log(
    "Enough USDG:",
    hasBalance ? "YES" : "NO"
  );

  console.log(
    "USDG approved to Permit2:",
    erc20Approved ? "YES" : "NO"
  );

  console.log(
    "Permit2 approved to Router:",
    permit2Approved ? "YES" : "NO"
  );

  console.log("\nNO TRANSACTION WAS SENT.");
}

main().catch(error => {
  console.error("\nERROR:");
  console.error(error);
});