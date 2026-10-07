// Read-only eth_call with temporary funding/approval overrides on a synthetic
// account. Real Ink router, pools, hook, token code and pool balances are used.
// Nothing is persisted onchain. This is not a user's actual wallet rehearsal.
// USDG slots verified from BaseStorageV3.sol on its deployed implementation;
// Permit2 slot and packing verified from AllowanceTransfer.sol.
import fs from 'node:fs';
import { AbiCoder, Interface, keccak256, toBeHex, toQuantity } from 'ethers';
import { INK, SWAP_PARAM } from './ink-engine.mjs';
import { inkProvider } from './ink-rpc.mjs';

const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const provider = inkProvider();
const coder = AbiCoder.defaultAbiCoder();
const mapSlot = (key, slot) => keccak256(coder.encode(['address','uint256'],[key,slot]));
const word = value => toBeHex(value,32);
try {
  if (BigInt(await provider.send('eth_chainId', [])) !== INK.chainId) throw new Error('Wrong chain.');
  const account = fixture.transaction.from;
  const balanceSlot = mapSlot(account,1);
  const allowanceSlot = mapSlot(INK.permit2,BigInt(mapSlot(account,3)));
  // SignatureTransfer.nonceBitmap occupies slot 0; allowance is slot 1.
  const permitSlot = mapSlot(INK.router,BigInt(mapSlot(INK.usdg,BigInt(mapSlot(account,1)))));
  const amount = 100000000n;
  const overrides = {
    [INK.usdg]: {stateDiff:{[balanceSlot]:word(amount),[allowanceSlot]:word(amount)}},
    [INK.permit2]: {stateDiff:{[permitSlot]:word(amount | ((2n**48n-1n)<<160n))}},
  };
  const blockTag = toQuantity(fixture.block);
  const tokenAbi = new Interface(['function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)']);
  for (const [name,args] of [['balanceOf',[account]],['allowance',[account,INK.permit2]]]) {
    const data=await provider.send('eth_call',[{to:INK.usdg,data:tokenAbi.encodeFunctionData(name,args)},blockTag,overrides]);
    if (tokenAbi.decodeFunctionResult(name,data)[0] !== amount) throw new Error(`Invalid USDG ${name} override.`);
  }
  const permitAbi=new Interface(['function allowance(address,address,address) view returns (uint160,uint48,uint48)']);
  const permitResult=await provider.send('eth_call',[{to:INK.permit2,data:permitAbi.encodeFunctionData('allowance',[account,INK.usdg,INK.router])},blockTag,overrides]);
  if (permitAbi.decodeFunctionResult('allowance',permitResult)[0] !== amount) throw new Error('Invalid Permit2 override.');
  const tx={...fixture.transaction,value:'0x0'};
  await provider.send('eth_call',[tx,blockTag,overrides]);
  console.log('PASS: complete three-stock basket plus fee, using real deployed contracts and temporary synthetic funding/approvals.');
  // Break the first leg's minimum. The whole basket must revert.
  const routerAbi=new Interface(['function execute(bytes,bytes[],uint256)']);
  const decoded=routerAbi.decodeFunctionData('execute',tx.data);
  const inputs=Array.from(decoded[1]);
  const [actions,params]=coder.decode(['bytes','bytes[]'],inputs[0]);
  const original=coder.decode([SWAP_PARAM],params[0])[0];
  const modified=coder.encode([SWAP_PARAM],[{
    poolKey:{currency0:original.poolKey.currency0,currency1:original.poolKey.currency1,fee:original.poolKey.fee,tickSpacing:original.poolKey.tickSpacing,hooks:original.poolKey.hooks},
    zeroForOne:original.zeroForOne,amountIn:original.amountIn,amountOutMinimum:2n**127n,hookData:original.hookData,
  }]);
  inputs[0]=coder.encode(['bytes','bytes[]'],[actions,[modified,params[1],params[2]]]);
  let reverted=false;
  try {await provider.send('eth_call',[{...tx,data:routerAbi.encodeFunctionData('execute',[decoded[0],inputs,decoded[2]])},blockTag,overrides]);}
  catch(error) { if (error.code === 'CALL_EXCEPTION' || error.info?.error?.code === 3 || /revert/i.test(error.shortMessage || error.message)) reverted=true; else throw error; }
  if (!reverted) throw new Error('Impossible minimum unexpectedly succeeded.');
  console.log('PASS: impossible output minimum reverts the atomic transaction.');
} catch(error) {
  console.error(error.shortMessage || error.message);
  if(error.info?.error) console.error(JSON.stringify(error.info.error));
  if(error.data) console.error('Revert data:',error.data);
  process.exitCode=1;
} finally {provider.destroy();}
