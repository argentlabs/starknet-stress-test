import { readFileSync } from "fs";
import { provider } from "../lib";

// Be careful when using this script as it'll SPAM the RPC.
const hashes: string[] = readFileSync("./.env.txs").toString().split("\n");
console.log(`About to check ${hashes.length} transactions`);
await hashes.forEach(safeCheckTx);

async function safeCheckTx(txHash: string, retry = 0) {
  try {
    const { finality_status } = await provider.getTransactionStatus(txHash);
    console.log(`${txHash}\t\t${finality_status}`);
  } catch (e) {
    console.log(`Failing to safeCheckTx for ${txHash}, retrying... ${retry}`);
    if (retry >= 3) {
      console.log(e);
      return;
    }
    return safeCheckTx(txHash, retry + 1);
  }
}
