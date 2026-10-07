// Read-only: live quotes and unsigned calldata. No signing or broadcasting.
import { Contract, parseUnits, formatUnits } from 'ethers';
import { INK, discoverInkMarkets, quoteInkBuy, allocateBasket, encodeInkBasket } from './ink-engine.mjs';

import { inkProvider } from './ink-rpc.mjs';
const provider = inkProvider();
try {
  const block = await provider.getBlockNumber();
  if ((await provider.getNetwork()).chainId !== INK.chainId) throw new Error('Wrong chain.');
  for (const address of [INK.router, INK.quoter, INK.permit2]) {
    if (await provider.getCode(address, block) === '0x') throw new Error(`Contract missing: ${address}`);
  }
  const router = new Contract(INK.router, ['function poolManager() view returns (address)'], provider);
  if ((await router.poolManager({blockTag: block})).toLowerCase() !== INK.poolManager.toLowerCase()) throw new Error('Router PoolManager mismatch.');
  const markets = await discoverInkMarkets(provider, block);
  console.error(`Discovered ${markets.length} Ink markets at block ${block}.`);
  const basket = [{symbol: 'NVDA', weight: 40}, {symbol: 'SPY', weight: 35}, {symbol: 'AAPL', weight: 25}];
  const totalRaw = parseUnits(process.argv[2] || '10', 6);
  const { feeRaw, allocations } = allocateBasket(totalRaw, basket);
  const quotes = [];
  for (const allocation of allocations) {
    const pool = markets.find(p => p.token.symbol === allocation.symbol);
    if (!pool) throw new Error(`Missing ${allocation.symbol} pool.`);
    quotes.push(await quoteInkBuy(provider, pool, allocation.amountIn, 50n, block));
    console.error(`Verified ${allocation.symbol} quote.`);
  }
  const account = process.argv[3] || '0x0000000000000000000000000000000000001234';
  const transaction = encodeInkBasket(quotes, {account,
    feeRecipient: '0xbc9ca263a8a6872ddF808478ae9e0be14832e5b7', feeRaw,
    deadline: Math.floor(Date.now() / 1000) + 900});
  const output = {block, chainId: Number(INK.chainId), totalUSDG: formatUnits(totalRaw, 6),
    appFeeUSDG: formatUnits(feeRaw, 6), quotes: quotes.map(q => ({
      symbol: q.pool.token.wrappedSymbol, allocationUSDG: formatUnits(q.amountIn, 6),
      expectedWrappedTokens: formatUnits(q.amountOut, q.pool.token.decimals),
      minimumWrappedTokens: formatUnits(q.minAmountOut, q.pool.token.decimals),
      hookFeePercent: Number(q.feeBps) / 100,
    })), transaction,
    simulation: 'Quotes verified; full wallet transaction requires USDG and Permit2 approvals.'};
  if (process.argv[3]) {
    try {
      await provider.call({...transaction, blockTag: block});
      output.simulation = 'Full wallet transaction simulation passed.';
    } catch (error) {
      output.simulation = `Full wallet transaction simulation failed: ${error.shortMessage || error.message}`;
    }
  }
  console.log(JSON.stringify(output, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
} catch (error) {
  console.error(error.shortMessage || error.message);
  if (error.data) console.error('Revert data:', error.data);
  process.exitCode = 1;
} finally { provider.destroy(); }
