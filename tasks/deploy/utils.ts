import { Contract, ContractFactory, Signer } from "ethers";

export async function deployContract(
  name: string,
  factory: ContractFactory,
  signer: Signer,
  args: Array<any> = [],
): Promise<Contract> {
  const contract = await factory.connect(signer).deploy(...args);
  console.log("Deploying Contract => ", name);
  console.log("Contract Address => ", contract.address);
  console.log("Transaction Hash => ", contract.deployTransaction.hash);
  return contract.deployed();
}
