import dotenv from "dotenv";
import { RpcProvider } from "starknet";

dotenv.config({ override: true });

// Polls quickly
export class FastRpcProvider extends RpcProvider {
  waitForTransaction(txHash: string, options = {}) {
    return super.waitForTransaction(txHash, { retryInterval: 1000, ...options });
  }
}

export const provider = new FastRpcProvider({ nodeUrl: process.env.RPC_URL });
console.log("Provider:", provider.channel.nodeUrl);
