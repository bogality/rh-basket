import { AbiCoder, Contract, Interface, getAddress, keccak256, hexlify } from 'ethers';

// Quotrons integration guide and Uniswap/briefcase deployments/57073.json.
// Pin the original Universal Router: its swap tuple does NOT have minHopPriceX36.
export const INK = Object.freeze({
  chainId: 57073n,
  rpc: 'https://rpc-gel.inkonchain.com',
  explorer: 'https://explorer.inkonchain.com',
  usdg: '0xe343167631d89B6Ffc58B88d6b7fB0228795491D',
  factory: '0xbFA531C90FD9e42aC13Af14823B30e40761dd3A2',
  hook: '0x8bb4516059F9149Bc3b89018Fc7537f1F14a30cc',
  poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
  quoter: '0x3972c00f7ed4885e145823eb7c655375d275a1c5',
  router: '0x112908dac86e20e7241b0927479ea3bf935d1fa0',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
});
export const POOL_KEY = 'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
export const SWAP_PARAM = `tuple(${POOL_KEY} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`;
export const HOOK_ABI = [
  'function pools(bytes32) view returns (address stock,address vault,bool usdgIsCurrency0,bool paused,bool registered,uint16 feeBps,uint16 terminalShareBps)',
  'function feeExempt(address) view returns (bool)',
];
export const QUOTER_ABI = [
  `function quoteExactInputSingle(tuple(${POOL_KEY} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`,
];
const FACTORY_ABI = [
  'function stockCount() view returns (uint256)',
  'function allStocks(uint256) view returns (address)',
  'function poolOf(address) view returns (bytes32)',
  'function vaultOf(address) view returns (address)',
];
const TOKEN_ABI = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'];
const coder = AbiCoder.defaultAbiCoder();
const routerInterface = new Interface(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);

export function poolKey(stock) {
  stock = getAddress(stock);
  const usdgFirst = BigInt(INK.usdg) < BigInt(stock);
  return {
    currency0: usdgFirst ? INK.usdg : stock,
    currency1: usdgFirst ? stock : INK.usdg,
    fee: 0x800000, tickSpacing: 60, hooks: INK.hook,
  };
}

export async function discoverInkMarkets(provider, blockTag = 'latest') {
  if ((await provider.getNetwork()).chainId !== INK.chainId) throw new Error('Switch to Ink (57073).');
  const at = { blockTag };
  const factory = new Contract(INK.factory, FACTORY_ABI, provider);
  if (Number(await new Contract(INK.usdg, TOKEN_ABI, provider).decimals(at)) !== 6) {
    throw new Error('Unexpected USDG decimals.');
  }
  const count = Number(await factory.stockCount(at));
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new Error('Unexpected market count.');
  const markets = [];
  for (let i = 0; i < count; i++) {
    const address = await factory.allStocks(i, at);
    const token = new Contract(address, TOKEN_ABI, provider);
    const wrappedSymbol = await token.symbol(at);
    const decimals = Number(await token.decimals(at));
    const key = poolKey(address);
    const id = await factory.poolOf(address, at);
    if (keccak256(coder.encode([POOL_KEY], [key])).toLowerCase() !== id.toLowerCase()) {
      throw new Error(`PoolKey mismatch for ${wrappedSymbol}.`);
    }
    markets.push({ id, key, vault: await factory.vaultOf(address, at), token: {
      address, decimals, wrappedSymbol,
      // Human ticker for presets; amounts are still wrapped-token units.
      symbol: wrappedSymbol.replace(/^w(.+)x$/, '$1'),
    }});
  }
  return markets.sort((a, b) => a.token.symbol.localeCompare(b.token.symbol));
}

export async function quoteInkBuy(provider, pool, amountIn, slippageBps, blockTag = 'latest') {
  amountIn = BigInt(amountIn);
  slippageBps = BigInt(slippageBps);
  if (amountIn <= 0n || amountIn >= 2n ** 128n) throw new Error('Invalid swap amount.');
  if (slippageBps < 0n || slippageBps > 500n) throw new Error('Slippage must be between 0% and 5%.');
  const at = { blockTag };
  const hook = new Contract(INK.hook, HOOK_ABI, provider);
  const cfg = await hook.pools(pool.id, at);
  if (!cfg.registered || cfg.paused || cfg.stock.toLowerCase() !== pool.token.address.toLowerCase()) {
    throw new Error(`${pool.token.symbol} market is unavailable.`);
  }
  // Quoter and router must see the same hook fee; never quote a fee-exempt path
  // and execute a fee-paying path (or the reverse).
  const quoteExempt = await hook.feeExempt(INK.quoter, at);
  const routerExempt = await hook.feeExempt(INK.router, at);
  if (quoteExempt !== routerExempt) throw new Error('Quoter/router hook fees differ.');
  const zeroForOne = pool.key.currency0.toLowerCase() === INK.usdg.toLowerCase();
  const quoter = new Contract(INK.quoter, QUOTER_ABI, provider);
  const result = await quoter.quoteExactInputSingle.staticCall({
    poolKey: pool.key, zeroForOne, exactAmount: amountIn, hookData: '0x',
  }, at);
  const minAmountOut = result.amountOut * (10000n - slippageBps) / 10000n;
  if (minAmountOut <= 0n || result.amountOut >= 2n ** 128n) throw new Error(`${pool.token.symbol} has no usable quote.`);
  return { pool, amountIn, zeroForOne, amountOut: result.amountOut, minAmountOut,
    feeBps: routerExempt ? 0n : BigInt(cfg.feeBps), gasEstimate: result.gasEstimate };
}

export function allocateBasket(totalRaw, basket, appFeeBps = 10n) {
  totalRaw = BigInt(totalRaw); appFeeBps = BigInt(appFeeBps);
  if (totalRaw <= 0n || appFeeBps < 0n || appFeeBps > 1000n) throw new Error('Invalid basket amount or fee.');
  if (basket.length < 2 || basket.length > 5) throw new Error('Choose 2–5 different stocks.');
  if (new Set(basket.map(item => item.symbol)).size !== basket.length) throw new Error('Choose each stock only once.');
  const weights = basket.map(item => {
    const weight = Number(item.weight);
    const bps = Math.round(weight * 100);
    if (!Number.isFinite(weight) || bps <= 0 || Math.abs(weight * 100 - bps) > 1e-6) throw new Error('Use positive weights with up to two decimals.');
    return BigInt(bps);
  });
  if (weights.reduce((a, b) => a + b, 0n) !== 10000n) throw new Error('Weights must add to 100%.');
  const feeRaw = totalRaw * appFeeBps / 10000n;
  const investedRaw = totalRaw - feeRaw;
  let allocated = 0n;
  const allocations = basket.map((item, i) => {
    const amountIn = i === basket.length - 1 ? investedRaw - allocated : investedRaw * weights[i] / 10000n;
    if (amountIn <= 0n || amountIn >= 2n ** 128n) throw new Error('Basket allocation is out of range.');
    allocated += amountIn;
    return { ...item, amountIn };
  });
  return { feeRaw, investedRaw, allocations };
}

export function encodeInkBasket(quotes, { account, feeRecipient, feeRaw = 0n, deadline }) {
  if (quotes.length < 2 || quotes.length > 5) throw new Error('Choose 2–5 different stocks.');
  getAddress(account); getAddress(feeRecipient);
  if (!Number.isSafeInteger(deadline) || deadline <= Math.floor(Date.now() / 1000)) throw new Error('Invalid deadline.');
  const commands = [], inputs = [];
  for (const q of quotes) {
    commands.push(0x10);
    const swap = coder.encode([SWAP_PARAM], [{poolKey: q.pool.key, zeroForOne: q.zeroForOne,
      amountIn: q.amountIn, amountOutMinimum: q.minAmountOut, hookData: '0x'}]);
    inputs.push(coder.encode(['bytes', 'bytes[]'], ['0x060c0f', [
      swap, coder.encode(['address', 'uint256'], [INK.usdg, q.amountIn]),
      coder.encode(['address', 'uint256'], [q.pool.token.address, q.minAmountOut]),
    ]]));
  }
  if (BigInt(feeRaw) > 0n) {
    commands.push(0x02);
    inputs.push(coder.encode(['address', 'address', 'uint160'], [INK.usdg, feeRecipient, feeRaw]));
  }
  return { from: getAddress(account), to: INK.router, value: 0n,
    data: routerInterface.encodeFunctionData('execute', [hexlify(Uint8Array.from(commands)), inputs, deadline]) };
}
