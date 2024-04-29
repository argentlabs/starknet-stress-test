import dotenv from "dotenv";
import { writeFileSync } from "fs";
import { Account } from "starknet";
import { DeployAccountParams, deployAccountWithoutGuardian } from "../lib";

dotenv.config({ override: true });

// Update theses
const accountClassHash = process.env.ARGENT_CLASS_HASH;
const ethFundingAmount = BigInt(1e16);
const strkFundingAmount = BigInt(1e17);

// Fixed constants
const selfDeploy = true;
const amountV3accounts = 8;
const amountV2accounts = 2;

console.log(`About to deploy ${amountV3accounts} accounts using TX_V3`);
const v3Accounts = await deployAccounts(amountV3accounts, {
  useTxV3: true,
  fundingAmount: strkFundingAmount,
  selfDeploy,
  classHash: accountClassHash,
});
writeFileSync("./.env.v3Accounts.json", JSON.stringify(v3Accounts)); // Be careful this might override your existing accounts

console.log(`About to deploy ${amountV2accounts} accounts using TX_V2`);
const v2Accounts = await deployAccounts(amountV2accounts, {
  useTxV3: false,
  fundingAmount: ethFundingAmount,
  selfDeploy,
  classHash: accountClassHash,
});
writeFileSync("./.env.v2Accounts.json", JSON.stringify(v2Accounts)); // Be careful this might override your existing accounts

// Every account is deployed one after the other (thus blocking) to avoid any issue when funding them
// Improvement possible: we could group this under a big multicall
async function deployAccounts(amountAccountToDeploy: number, params: DeployAccountParams): Promise<Account[]> {
  const accounts: Account[] = [];
  for (let i = 0; i < amountAccountToDeploy; i++) {
    console.log(`Deploying account #${i}`);
    const account = await safeDeployAccount(params);
    if (account) {
      accounts.push(account);
    }
  }
  return accounts;
}

async function safeDeployAccount(params: DeployAccountParams, retry = 0): Promise<Account | undefined> {
  try {
    const { account } = await deployAccountWithoutGuardian(params);
    return account;
  } catch (e) {
    console.log(`Failing to deploy, retrying... (${retry})`);
    if (retry >= 3) {
      console.log(e);
      return;
    }
    return safeDeployAccount(params, retry + 1);
  }
}
