# Introduction

This collection of scripts is designed to execute stress tests on the Starknet network.  
It utilizes the latest Argent account available, employing the new signature format.  
The last successful test was conducted on Sepolia using the ClassHash 0x7e05c2de6c722119fa8fc7cd3571ad2bb286a2c0a84d5b6575b4e4ea4290d9d.

To begin, you'll need to deploy and fund a series of accounts. These accounts will subsequently be utilized for ERC20 transfers.

# Installation

Start by installing the required dependencies using your preferred package manager:

```bash
yarn
```

Then, complete the setup by populating the [env file](.env.example) and renaming it to .env:

```bash
mv .env.example .env
```

# Running

The repository includes the following scripts:

- [deploy-accounts](./scripts/deploy-accounts.ts): Deploys and saves the accounts in two files.
- [fund-accounts](./scripts/fund-accounts.ts): Verifies the balances of all accounts and transfers funds to those with balances below the threshold using a multicall
- [stress-test](./scripts/stress-test.ts): Executes the stress test
- [check-tx-status](./scripts/check-tx-status.ts): Check the transactions statuses. Caution: this may overload the RPC

To be able to perform the stress test, you'll need some accounts to be able to do those transfers.  
Begin by reviewing [deploy-account script](./scripts/deploy-accounts.ts). Make sure all the constants suits your need. Execute the script using `yarn run deploy-accounts`. This will create two environment files used by the stress-test script.  
**Please note, this setup is a one-time requirement.**

Once all accounts are deployed, and if necessary, you can check all accounts have enough funds to perform the transfers using `yarn run fund-accounts`. This will check the balance of every account and fund the one for which the balance is under the defined threshold.

Now you can perform the actual stress test. First check that the correct parameters are defined according to your needs:

- Desired Transactions Per Second (TPS)
- Duration of the script's execution
- Ratio of transaction versions V3 (STRK as fee token) compared to transaction V2 (ETH as fee token)
- Current maxFee and L1 gas allowance per transaction (provide additional margin to prevent transaction reverted).

Then you can run the script using `yarn start > log`.
Due to the extensive logging, it's advisable to redirect the output to a file for post-analysis.  
Upon completion (or if interrupted with CTRL+C), the
Upon completion (or if interrupted with CTRL+C), the script will display statistics and create a new file (.env.txs) containing all transaction hashes. To check these transaction statuses, run `yarn check-tx-status`. Caution: this script may overload the RPC.

## How many accounts do I need to deploy?

Let's assume you'd wanna hit 50 TPS.  
Given that a transaction takes approximately 1.15s (today, according to [voyager](https://voyager.online/analytics)) but sometimes it can take longer. Let's be safe and assume 10s average time. You'll need then to deploy `AVERAGE_TIME * TPS`:  
10 \* 50 = 500 accounts  
For a stress test at 50 TPS, with 80% of transactions using STRK as the fee token (TX_V3), deploy 400 TX_V3 accounts and 100 TX_V2 accounts. Adjust the ratio as necessary.

## How much I should fund each account?

This depends entirely on the current network costs. If a simple transfer costs X (transfer + fee), plan accordingly.  
If you plan on hitting 50 TPS for 10 minutes, the total amount of transactions will be: `TPS * TIME_IN_SECONDS`:  
50 \* (60 \* 10) = 30.000 transactions  
If you have 500 accounts deployed to perform these transactions each accounts will need to do 60 transfers (30.000 / 500).
Assuming that a transfer costs 0.0000001ETH (random number).  
You need to fund each account with AT LEAST 0.0000001ETH \* 60 = 0.000006ETH.  
Apply a similar approach for STRK accounts.
