import { readFileSync } from "fs";
import { Account, Call, Contract, uint256 } from "starknet";
import { deployer, ethContract, provider, strkContract } from "../lib";

// Update theses
const ethFundingAmount = BigInt(1e16);
const strkFundingAmount = BigInt(5e17);

// Parse file of accounts
const v3Accounts: Account[] = JSON.parse(readFileSync("./.env.v3Accounts.json", "utf-8"));
const v2Accounts: Account[] = JSON.parse(readFileSync("./.env.v2Accounts.json", "utf-8"));
const calls: Call[] = [];

// This will query too much in short amount of time, run at your own risks
// await Promise.all(v3Accounts.map(async (acc) => await checkBalance(strkContract, acc)));
// await Promise.all(v2Accounts.map(async (acc) => await checkBalance(ethContract, acc)));

for (const account of v3Accounts) {
  await checkBalance(strkContract, account, strkFundingAmount);
}

for (const account of v2Accounts) {
  await checkBalance(ethContract, account, ethFundingAmount);
}

if (calls.length > 0) {
  console.log(`About to fund ${calls.length} accounts`);
  await processCallsInChunks(calls, 500);
}
console.log(
  `All accounts should have at least ${Number(ethFundingAmount) / 1e18} ETH or ${Number(strkFundingAmount) / 1e18} STRK`,
);

async function checkBalance(contract: Contract, account: Account, fundingAmount: bigint) {
  const balance = await safeBalanceOf(contract, account.address);
  if (balance < fundingAmount) {
    calls.push(contract.populateTransaction.transfer(account.address, uint256.bnToUint256(fundingAmount - balance)));
  }
}

async function safeBalanceOf(contract: Contract, address: string, retry = 0) {
  try {
    return await contract.balanceOf(address);
  } catch (e) {
    console.log(`Failing to get balance, retrying... (${retry})`);
    if (retry >= 5) {
      console.log(e);
      return;
    }
    return safeBalanceOf(contract, address, retry + 1);
  }
}

async function processCallsInChunks(calls: Call[], chunkSize: number) {
  for (let i = 0; i < calls.length; i += chunkSize) {
    console.log(`Funding from ${i} to ${i + chunkSize}`);
    const chunk = calls.slice(i, i + chunkSize);
    const { transaction_hash } = await deployer.execute(chunk);
    await provider.waitForTransaction(transaction_hash);
  }
}
