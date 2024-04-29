import {
  Abi,
  Account,
  AllowArray,
  CairoOption,
  CairoOptionVariant,
  Call,
  CallData,
  Contract,
  DeployAccountContractPayload,
  DeployContractResponse,
  InvokeFunctionResponse,
  RPC,
  UniversalDetails,
  hash,
  num,
  uint256,
} from "starknet";
import { ArgentSigner, KeyPair, ethAddress, loadContract, randomStarknetKeyPair, strkAddress } from ".";
import { provider } from "./provider";

export class ArgentAccount extends Account {
  override async deployAccount(
    payload: DeployAccountContractPayload,
    details?: UniversalDetails,
  ): Promise<DeployContractResponse> {
    details ||= {};
    if (!details.skipValidate) {
      details.skipValidate = false;
    }
    return super.deployAccount(payload, details);
  }

  override async execute(
    calls: AllowArray<Call>,
    abis?: Abi[],
    details: UniversalDetails = {},
  ): Promise<InvokeFunctionResponse> {
    details ||= {};
    if (!details.skipValidate) {
      details.skipValidate = false;
    }
    if (details.resourceBounds) {
      return super.execute(calls, abis, details);
    }
    const estimate = await this.estimateFee(calls, details);
    return super.execute(calls, abis, {
      ...details,
      resourceBounds: {
        ...estimate.resourceBounds,
        l1_gas: {
          ...estimate.resourceBounds.l1_gas,
          max_amount: num.toHexString(num.addPercent(estimate.resourceBounds.l1_gas.max_amount, 30)),
        },
      },
    });
  }
}

export interface ArgentWallet {
  account: ArgentAccount;
  accountContract: Contract;
  owner: KeyPair;
}

export const deployer = (() => {
  const address = process.env.ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;
  if (address && privateKey) {
    return new Account(provider, address, privateKey, undefined, RPC.ETransactionVersion.V2);
  }
  throw new Error("Missing deployer address or private key, please set ADDRESS and PRIVATE_KEY env variables.");
})();

console.log("Deployer:", deployer.address);

async function deployAccountInner(params: DeployAccountParams): Promise<
  DeployAccountParams & {
    account: Account;
    classHash: string;
    owner: KeyPair;
    salt: string;
    transactionHash: string;
  }
> {
  const finalParams = {
    ...params,
    classHash: params.classHash!,
    salt: params.salt ?? num.toHex(randomStarknetKeyPair().privateKey),
    owner: params.owner ?? randomStarknetKeyPair(),
    useTxV3: params.useTxV3 ?? false,
    selfDeploy: params.selfDeploy ?? false,
  };
  const constructorCalldata = CallData.compile({
    owner: finalParams.owner.signer,
    guardian: new CairoOption(CairoOptionVariant.None),
  });

  const { classHash, salt } = finalParams;
  const contractAddress = hash.calculateContractAddressFromHash(salt, classHash, constructorCalldata, 0);
  const fundingCall = await fundAccountCall(contractAddress, finalParams.fundingAmount!, finalParams.useTxV3);
  const calls = fundingCall ? [fundingCall] : [];

  const transactionVersion = finalParams.useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  const signer = new ArgentSigner(finalParams.owner);
  const account = new ArgentAccount(provider, contractAddress, signer, "1", transactionVersion);

  let transactionHash;
  if (finalParams.selfDeploy) {
    const response = await deployer.execute(calls);
    await provider.waitForTransaction(response.transaction_hash);
    const { transaction_hash } = await account.deploySelf({ classHash, constructorCalldata, addressSalt: salt });
    transactionHash = transaction_hash;
  } else {
    const udcCalls = deployer.buildUDCContractPayload({ classHash, salt, constructorCalldata, unique: false });
    const { transaction_hash } = await deployer.execute([...calls, ...udcCalls]);
    transactionHash = transaction_hash;
  }

  await provider.waitForTransaction(transactionHash);
  return { ...finalParams, account, transactionHash };
}

export type DeployAccountParams = {
  useTxV3?: boolean;
  classHash?: string;
  owner?: KeyPair;
  salt?: string;
  fundingAmount?: number | bigint;
  selfDeploy?: boolean;
};

export async function deployAccountWithoutGuardian(params: DeployAccountParams = {}): Promise<ArgentWallet> {
  const { account, owner } = await deployAccountInner(params);
  const accountContract = await loadContract(account.address);
  accountContract.connect(account);
  return { account, accountContract, owner };
}

export async function fundAccountCall(
  recipient: string,
  amount: number | bigint,
  useTxV3: boolean,
): Promise<Call | undefined> {
  if (amount <= 0n) {
    return;
  }
  const contractAddress = useTxV3 ? strkAddress : ethAddress;
  const calldata = CallData.compile([recipient, uint256.bnToUint256(amount)]);
  return { contractAddress, calldata, entrypoint: "transfer" };
}
