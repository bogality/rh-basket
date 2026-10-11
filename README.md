# StockStack

An independent prototype for building tokenized stock baskets on Robinhood Chain.

StockStack lets a user select assets, assign percentage weights, and review a USDG-funded basket before submitting a wallet transaction. It explores a simpler interface for coordinating multiple tokenized equity purchases through Uniswap V4.

## Project status

The repository contains the basket-building interface and supporting research scripts. It targets **Robinhood Chain (chain ID 4663)**. This is a prototype; the presence of transaction code does not establish successful production trading or an audited integration.

Automated rebalancing and tokenized basket minting/redemption are future ideas, not implemented features in this repository.

## Implemented in the source

- Discovery of active USDG pools through the onchain Fables registry.
- Custom asset selection, percentage allocations, and preset baskets.
- Wallet connection with Reown AppKit and network switching.
- USDG and Permit2/router permission checks and approval flows.
- Per-asset Uniswap V4 quotes, slippage limits, and unsigned Universal Router transaction construction.
- Gas estimation before submission, quote expiry handling, and transaction status display.
- A **0.10% app fee**, included in the basket quote and encoded transaction.

These items describe the code, rather than a claim that every external integration has been independently validated.

## My role and use of AI

I own the product concept, feature requirements, interface decisions, and development priorities. I use ChatGPT to assist with implementation, integration research, and troubleshooting. My work includes hands-on wallet and interface testing, identifying confusing steps, and directing revisions to the approval and quote flow.

This project demonstrates an AI-assisted product development workflow. It does not represent unaided authorship of every line of code.

## Technology

HTML, CSS, JavaScript, Vite, ethers.js, Reown AppKit, Uniswap V4, Universal Router, and Permit2.

## Run locally

Use Node.js 20.19+ or a newer compatible release, with npm.

```bash
git clone https://github.com/bogality/rh-basket.git
cd rh-basket
npm ci
npm run dev
```

Open the local URL printed by Vite. The interface loads onchain pool information, so RPC availability affects the experience.

For a production build:

```bash
npm run build
```

The static build is written to `dist/`.

Wallet connectivity uses a Reown project ID configured in `index.html`. For your own deployment, configure your own Reown project and permitted origins, update the wallet metadata URL, and review the chain, contract, and fee settings in that file.

## Repository guide

| File | Purpose |
| --- | --- |
| `index.html` | Basket interface, wallet connection, approvals, quoting, and transaction submission |
| `basket-quote.js` | Read-only quotes for a 40/35/25 NVDA/SPY/AAPL example |
| `build-basket-tx.js` | Builds and prints an unsigned basket transaction |
| `build-approvals.js` | Approval transaction construction experiment |
| `simulate-3-dollar-basket.js` | Small-basket simulation experiment |
| `check-wallet.js` | Wallet status investigation |
| `check-nvda.js`, `quote-v4-nvda.js` | Single-market research |
| `inspect-hook.js`, `inspect-pool.js`, `inspect-v4.js` | Pool and protocol inspection |

Research scripts contain fixed example amounts, addresses, and network settings. Review them before use; they are not a general command-line product.

## Validation and limitations

- Prior development included quote testing and unsigned transaction construction.
- This documentation update involved source inspection only; it did not execute a live swap.
- The repository does not currently provide an automated test suite. Its `npm test` command is a placeholder.
- End-to-end execution depends on wallet permissions, RPC access, pool liquidity, and the deployed contracts.
- No independent smart contract or security audit is claimed.

## Related project

[BagCheck](https://bagcheck.cash) is my separate crypto position calculator and swap interface. Its live site is available above; its source is maintained separately from this repository.
