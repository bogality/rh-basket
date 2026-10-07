import test from 'node:test';
import assert from 'node:assert/strict';
import { AbiCoder, Interface } from 'ethers';
import { INK, poolKey, allocateBasket, encodeInkBasket, SWAP_PARAM } from './ink-engine.mjs';

const basket = [{symbol:'NVDA',weight:40},{symbol:'SPY',weight:35},{symbol:'AAPL',weight:25}];
test('fee plus stock allocations spends exactly the input, including rounding dust', () => {
  for (const amount of [10000n, 10001n, 10000000n, 123456789n]) {
    const a = allocateBasket(amount, basket);
    assert.equal(a.feeRaw + a.allocations.reduce((sum,x)=>sum+x.amountIn,0n),amount);
  }
  assert.deepEqual(allocateBasket(10000000n,basket).allocations.map(x=>x.amountIn),[3996000n,3496500n,2497500n]);
});
test('invalid weights, duplicate stocks, too many legs and dust allocations fail before approval', () => {
  assert.throws(()=>allocateBasket(10n,[{symbol:'NVDA',weight:100},{symbol:'NVDA',weight:1}]));
  assert.throws(()=>allocateBasket(10n,[{symbol:'NVDA',weight:40},{symbol:'AAPL',weight:40}]));
  assert.throws(()=>allocateBasket(10n,[{symbol:'NVDA',weight:NaN},{symbol:'AAPL',weight:50}]));
  assert.throws(()=>allocateBasket(1n,basket));
  assert.throws(()=>allocateBasket(10000n,Array.from({length:6},(_,i)=>({symbol:String(i),weight:100/6}))));
});
test('currency order yields correct buy direction on either side of USDG', () => {
  assert.equal(poolKey('0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5').currency1,INK.usdg);
  assert.equal(poolKey('0xf8c5308F80E459bb53d9EbE689854d9cBb2Caa6f').currency0,INK.usdg);
});
test('legacy Ink encoding enforces each minimum and uses atomic commands', () => {
  const coder=AbiCoder.defaultAbiCoder();
  const stocks=['0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5','0xE7E553Cd128F0011777323A0b44a7b96EA1CB540'];
  const quotes=stocks.map(stock=>({pool:{key:poolKey(stock),token:{address:stock}},zeroForOne:false,amountIn:100n,minAmountOut:20n}));
  const tx=encodeInkBasket(quotes,{account:'0x0000000000000000000000000000000000001234',feeRecipient:'0x0000000000000000000000000000000000005678',feeRaw:1n,deadline:Math.floor(Date.now()/1000)+900});
  const decoded=new Interface(['function execute(bytes,bytes[],uint256)']).decodeFunctionData('execute',tx.data);
  assert.equal(decoded[0],'0x101002'); // no allow-revert flags
  const [actions,params]=coder.decode(['bytes','bytes[]'],decoded[1][0]);
  assert.equal(actions,'0x060c0f');
  const [swap]=coder.decode([SWAP_PARAM],params[0]);
  assert.equal(swap.amountOutMinimum,20n);
  assert.equal(coder.decode(['address','uint256'],params[1])[1],100n);
  assert.equal(coder.decode(['address','uint256'],params[2])[1],20n);
});
