const { ethers } = require("ethers");

const USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const PERMIT2 =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const UNIVERSAL_ROUTER =
  "0x8876789976decbfcbbbe364623c63652db8c0904";

const TEST_ALLOWANCE_USDG = "7";

const ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)"
];

const PERMIT2_ABI = [
  "function approve(address token,address spender,uint160 amount,uint48 expiration)"
];

async function main() {
  const usdgAmount =
    ethers.parseUnits(TEST_ALLOWANCE_USDG, 6);

  const erc20Interface =
    new ethers.Interface(ERC20_ABI);

  const permit2Interface =
    new ethers.Interface(PERMIT2_ABI);

  /*
    Approval #1:
    USDG contract authorizes Permit2 to transfer
    up to 10 USDG from the wallet.
  */

  const approvePermit2Calldata =
    erc20Interface.encodeFunctionData(
      "approve",
      [
        PERMIT2,
        usdgAmount
      ]
    );

  /*
    Approval #2:
    Permit2 authorizes the Universal Router
    to spend up to 10 USDG.

    We use a 24-hour expiration for this test.
  */

  const now =
    Math.floor(Date.now() / 1000);

  const expiration =
    now + (24 * 60 * 60);

  const approveRouterCalldata =
    permit2Interface.encodeFunctionData(
      "approve",
      [
        USDG,
        UNIVERSAL_ROUTER,
        usdgAmount,
        expiration
      ]
    );

  console.log("============================");
  console.log("APPROVAL #1");
  console.log("============================");

  console.log("\nPurpose:");
  console.log(
    "Allow Permit2 to transfer up to 10 USDG."
  );

  console.log("\nTo:");
  console.log(USDG);

  console.log("\nFunction:");
  console.log("approve(PERMIT2, 10 USDG)");

  console.log("\nSpender:");
  console.log(PERMIT2);

  console.log("\nAmount:");
  console.log(TEST_ALLOWANCE_USDG, "USDG");

  console.log("\nValue:");
  console.log("0 ETH");

  console.log("\nCalldata:");
  console.log(approvePermit2Calldata);

  console.log("\n============================");
  console.log("APPROVAL #2");
  console.log("============================");

  console.log("\nPurpose:");
  console.log(
    "Allow Universal Router to spend up to 10 USDG through Permit2."
  );

  console.log("\nTo:");
  console.log(PERMIT2);

  console.log("\nToken:");
  console.log(USDG);

  console.log("\nSpender:");
  console.log(UNIVERSAL_ROUTER);

  console.log("\nAmount:");
  console.log(TEST_ALLOWANCE_USDG, "USDG");

  console.log("\nExpiration:");
  console.log(
    new Date(expiration * 1000).toISOString()
  );

  console.log("\nValue:");
  console.log("0 ETH");

  console.log("\nCalldata:");
  console.log(approveRouterCalldata);

  console.log("\n============================");
  console.log("IMPORTANT");
  console.log("============================");

  console.log(
    "These approval transactions were only encoded locally."
  );

  console.log(
    "Nothing was signed or broadcast."
  );
}

main().catch(error => {
  console.error("\nERROR:");
  console.error(error);
});