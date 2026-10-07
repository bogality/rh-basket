// Read-only discovery of the Quotrons Ink venue. Never signs or sends transactions.
// Source: https://www.quotrons.cash/docs#xstocks-integration
const { ethers } = require("ethers");

const RPC = process.env.INK_RPC_URL || "https://rpc-gel.inkonchain.com";
const CHAIN_ID = 57073n;
const USDG = "0xe343167631d89B6Ffc58B88d6b7fB0228795491D";
const HOOK = "0x8bb4516059F9149Bc3b89018Fc7537f1F14a30cc";
const FACTORY = "0xbFA531C90FD9e42aC13Af14823B30e40761dd3A2";
const POOL_MANAGER = "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32";
const TOKEN_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const FACTORY_ABI = [
  "function stockCount() view returns (uint256)",
  "function allStocks(uint256) view returns (address)",
  "function poolOf(address) view returns (bytes32)",
  "function vaultOf(address) view returns (address)",
];

async function main() {
  // Public endpoints may reject batch requests. Pin all reads to one block.
  const request = new ethers.FetchRequest(RPC);
  request.timeout = 15000;
  const provider = new ethers.JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) throw new Error("RPC is not Ink mainnet");
    const block = await provider.getBlockNumber();
    const at = { blockTag: block };
    for (const address of [USDG, HOOK, FACTORY, POOL_MANAGER]) {
      if (await provider.getCode(address, block) === "0x") {
        throw new Error(`Missing deployed contract: ${address}`);
      }
    }
    const quoteToken = new ethers.Contract(USDG, TOKEN_ABI, provider);
    const quoteDecimals = Number(await quoteToken.decimals(at));
    const factory = new ethers.Contract(FACTORY, FACTORY_ABI, provider);
    const count = Number(await factory.stockCount(at));
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
      throw new Error(`Unexpected market count: ${count}`);
    }
    const markets = [];
    for (let i = 0; i < count; i++) {
      const stock = await factory.allStocks(i, at);
      const token = new ethers.Contract(stock, TOKEN_ABI, provider);
      const symbol = await token.symbol(at);
      const decimals = Number(await token.decimals(at));
      const poolId = await factory.poolOf(stock, at);
      const vault = await factory.vaultOf(stock, at);
      const usdgFirst = BigInt(USDG) < BigInt(stock);
      const key = {
        currency0: usdgFirst ? USDG : stock,
        currency1: usdgFirst ? stock : USDG,
        fee: 0x800000,
        tickSpacing: 60,
        hooks: HOOK,
      };
      const derivedId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint24", "int24", "address"],
        [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
      ));
      if (derivedId.toLowerCase() !== poolId.toLowerCase()) {
        throw new Error(`PoolKey mismatch for ${symbol}`);
      }
      markets.push({ symbol, stock, decimals, poolId, vault, key, buyZeroForOne: usdgFirst });
    }
    console.log(JSON.stringify({
      chainId: Number(CHAIN_ID), block, usdg: USDG, quoteDecimals,
      poolManager: POOL_MANAGER, factory: FACTORY, markets,
      note: "Discovery only. Live swap quotes and liquidity checks are still required.",
    }, null, 2));
  } finally {
    provider.destroy();
  }
}

main().catch(error => {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
});
