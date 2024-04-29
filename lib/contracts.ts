import { Contract } from "starknet";
import { provider } from ".";

export const ethAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
export const strkAddress = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const ethContract = await loadContract(ethAddress);
export const strkContract = await loadContract(strkAddress);

export async function loadContract(contractAddress: string, retry = 0): Promise<Contract> {
  try {
    const { abi } = await provider.getClassAt(contractAddress);

    if (!abi) {
      throw new Error("Error while getting ABI");
    }
    return new Contract(abi, contractAddress, provider);
  } catch (e) {
    console.log(`Failing to loadContract for ${contractAddress}, retrying... (${retry})`);
    if (retry >= 3) {
      console.log(e);
      // If this isn't working we can fail
      throw new Error("Failing to load contract...");
    }

    return await loadContract(contractAddress, retry + 1);
  }
}
