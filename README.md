# StockStack — Ink baskets

Work branch: `work/ink-baskets`. The frontend now trades Quotrons wrapped
xStocks on Ink (57073), using the pinned original Uniswap Universal Router.
The prior Robinhood frontend remains available in the base Git commit.

## Run

```sh
npm ci
npm run dev -- --host 127.0.0.1
npm test
npm run build
npm run ink:quote -- 10
```

CLI tools accept `INK_RPC_URL`. For a managed environment where Node HTTP
requests time out, set `INK_RPC_CURL=1` on the quote/simulation commands.
Use a private RPC for production reliability; keep private RPC credentials
outside public frontend code. The browser currently uses the user's wallet
provider for pool discovery, quoting, simulation and signing.

## Flow

Connect to Ink, select 2–5 unique stocks, set weights totaling 100%, approve
USDG to Permit2 and Permit2 to the pinned router, build and simulate, then
confirm the basket in the wallet. The app fee remains 10 basis points (0.10%)
to the existing configured recipient. Hook fees are checked live per pool.
Outputs are wrapped ERC-4626 xStock tokens, not underlying-share quantities.

The shared engine discovers factory markets and verifies every PoolKey,
checks paused/registered state and quoter/router fee exemptions, allocates
all input including rounding dust, and encodes atomic V4 swaps with a
minimum output for each leg. It uses the router's verified legacy swap tuple,
without `minHopPriceX36`. Expiry, basket edits and wallet/network changes
invalidate sending. A full wallet simulation and gas estimate precede sending.

## Verification on October 7, 2026 UTC

- Nine factory markets discovered; PoolKey derivation matched onchain IDs.
- At block 57,843,712, a $10 USDG basket (40% NVDA, 35% SPY, 25% AAPL)
  quoted successfully: $0.01 app fee, $9.99 allocated to the stock legs.
  Each pool's hook fee was 0.30% at that block.
- Full `eth_call` basket simulation passed using actual deployed router,
  pool, hook, USDG and Permit2 code. Only a synthetic account's funding and
  approvals were overridden temporarily. No state or funds changed onchain.
- Raising one output minimum to an impossible amount reverted the atomic
  transaction.
- Four engine tests passed; production build passed.
- Browser/wallet verification remains outstanding: the cloud browser cannot
  reach this workspace's localhost server. No deployment has been published.
- GitHub connection verified; changes are being published as a draft pull request.

Reproduce the read-only simulation:

```sh
INK_RPC_CURL=1 node quote-ink-basket.mjs 10 > /tmp/ink-quote.json
INK_RPC_URL=https://rpc-ten.inkonchain.com INK_RPC_CURL=1 node simulate-ink-basket.mjs /tmp/ink-quote.json
```

This synthetic rehearsal does not establish a real user's balances,
allowances, eligibility, or successful transaction. A user-approved live
wallet test is still required before launch.

Sources:
- https://www.quotrons.cash/docs#xstocks-integration
- https://github.com/Uniswap/briefcase/blob/main/deployments/57073.json
- Verified router/hook/USDG implementation/Permit2 source on https://explorer.inkonchain.com
