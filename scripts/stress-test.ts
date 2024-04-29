import { readFileSync, writeFileSync } from "fs";
import { exit } from "process";
import { Account, RPC, num, uint256 } from "starknet";
import { ArgentAccount, ethContract, provider, strkContract } from "../lib";

// Update theses
const aimTPS = 3;
const timeInSeconds = 5;
const ratioTxV3 = 0.6;
const maxFee = 1e15;
const l1_gas = { max_amount: "0x1000", max_price_per_unit: num.toHex(1e14) };

// Fixed constants
const v3Amount = Math.ceil(aimTPS * ratioTxV3);
const v2Amount = aimTPS - v3Amount;
console.log(`${v3Amount} v3 <=> ${v2Amount} v2`);
const l2_gas = { max_amount: "0x0", max_price_per_unit: "0x0" };
const resourceBounds = {
  l2_gas,
  l1_gas,
};
const nonceMap = new Map<string, bigint>();
const txs: string[] = [];
const startTime = new Date().getTime();

// Parse file of accounts
const v3Accounts: Account[] = JSON.parse(readFileSync("./.env.v3Accounts.json", "utf-8")).map(
  (acc: any) => new ArgentAccount(provider, acc.address, acc.signer.keys[0].pk, "1", RPC.ETransactionVersion.V3),
);
const v2Accounts: Account[] = JSON.parse(readFileSync("./.env.v2Accounts.json", "utf-8")).map(
  (acc: any) => new ArgentAccount(provider, acc.address, acc.signer.keys[0].pk, "1", RPC.ETransactionVersion.V2),
);
console.log(`${v3Accounts.length} v3 accounts`);
console.log(`${v2Accounts.length} v2 accounts`);

//
// LOGIC
//
let successTx = 0;
let failTx = 0;

let iterationCount = 0;
setInterval(async () => {
  try {
    console.log(`${getFormattedDate()} Sending batch ${iterationCount}`);
    Array.from({ length: v3Amount }, () => sendTx(iterationCount, v3Accounts, "v3"));
    Array.from({ length: v2Amount }, () => sendTx(iterationCount, v2Accounts, "v2"));
  } catch (e) {
    console.log(`Error while sending batch ${iterationCount}`);
    console.log(e);
  }
  iterationCount++;

  if (iterationCount >= timeInSeconds) {
    printFinalStats();
  }
}, 1000);

// Capture ctrl+c event and print stats
process.on("SIGINT", function () {
  printFinalStats();
});

// Printing stats every 30s
setInterval(async () => {
  console.log(``);
  console.log(`${getFormattedDate()} Intermediate stats`);
  console.log(`\tCurrent TPS: ${((successTx + failTx) / ((new Date().getTime() - startTime) / 1000)).toFixed(0)}`);
  console.log(`\tTotal tx: ${successTx + failTx}`);
  console.log(`\tSuccess tx: ${successTx}`);
  console.log(`\tFail tx: ${failTx}`);
  try {
    const size = txs.length;
    console.log(`\tLast - 20, - 10, 0 txs`);
    console.log(`\t${txs[size - 21]}`);
    console.log(`\t${txs[size - 11]}`);
    console.log(`\t${txs[size - 1]}`);
  } catch (e) {
    console.log(`FAILING GETTING TX[]`);
  }
  console.log(``);
}, 30_000);

//
// HELPER FUNCTIONS
//
async function sendTx(batch: number, accounts: Account[], name: string) {
  const account = accounts.shift();
  // console.log(`${accounts.length} ${name} left `);
  if (!account) {
    console.log(`No more ${name} accounts left`);
    return;
  }
  if (await safeSendTx(batch, account)) {
    accounts.push(account);
    return;
  }
  // We try to recover x milliseconds later
  tryRecoverAccount(account, 15_000, accounts);
}

async function safeSendTx(batch: number, account: Account): Promise<boolean> {
  const startTime = new Date().getTime();
  // This can fail either when getting nonce OR when sending the transfer TX
  try {
    const contract = account.transactionVersion == RPC.ETransactionVersion.V3 ? strkContract : ethContract;
    contract.connect(account);
    const nonce = nonceMap.get(account.address)! || BigInt(await account.getNonce());
    const amount = uint256.bnToUint256(randomIntFromInterval(1000, 1));
    const receiver = randomIntFromInterval(100000000000, 1);
    const { transaction_hash } = await account.execute(
      contract.populateTransaction.transfer(receiver, amount),
      undefined,
      {
        skipValidate: true,
        maxFee,
        resourceBounds,
        nonce,
      },
    );
    nonceMap.set(account.address, nonce + 1n);

    successTx += 1;
    txs.push(transaction_hash);
    return true;
  } catch (e) {
    const totalTime = ((new Date().getTime() - startTime) / 1000).toFixed(0);
    console.log(
      `\t${getFormattedDate()} Failing on\t${account.transactionVersion}\t${batch} - ${
        account.address
      } - took ${totalTime}s`,
    );
    console.log(e);
    failTx += 1;
    return false;
  }
}

async function tryRecoverAccount(account: Account, time: number, accounts: Account[]) {
  console.log(`\t${getFormattedDate()} Trying to recover account ${account.address}`);
  return new Promise(() =>
    setTimeout(async function () {
      try {
        const nonce = BigInt(await account.getNonce());
        // console.log(`Nonce recovered is ${nonce}`);
        nonceMap.set(account.address, nonce);
        console.log(`\t${getFormattedDate()} Account ${account.address} successfully recovered`);
        accounts.push(account);
      } catch (e) {
        console.log(e);
        if (time >= 60_000) {
          console.log(`\t${getFormattedDate()} Couldn't recover ${account.address}, retrying in ${time}`);
          await tryRecoverAccount(account, 60_000, accounts);
        } else {
          console.log(`\t${getFormattedDate()} Couldn't recover ${account.address}, retrying in ${time * 2}`);
          await tryRecoverAccount(account, time * 2, accounts);
        }
      }
    }, time),
  );
}

function printFinalStats() {
  console.log(`\nExpected tx: ${aimTPS * timeInSeconds}`);
  console.log(`Total tx: ${successTx + failTx}`);
  console.log(`Success tx: ${successTx}`);
  console.log(`Fail tx: ${failTx}`);
  if (txs.length > 0) {
    writeFileSync("./.env.txs", txs.join("\n")); // Be careful this might override your previous batch of TXs
  }
  exit();
}

function getFormattedDate() {
  return "[" + new Date().toLocaleTimeString() + "]";
}

function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
