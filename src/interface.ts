import { BigNumberish } from 'ethers';

// Interface
export interface TokenPermissions {
  token: string; // address型はTypeScriptではstringとして扱います
  amount: BigNumberish; // uint256型はTypeScriptではBigNumberishとして扱います
}

export interface PermitBatchTransferFrom {
  permitted: TokenPermissions[]; // TokenPermissions構造体の配列
  nonce: BigNumberish; // uint256型はTypeScriptではBigNumberishとして扱います
  deadline: BigNumberish; // uint256型はTypeScriptではBigNumberishとして扱います
}

export interface SignatureTransferDetails {
  to: string; // address型はTypeScriptではstringとして扱います
  requestedAmount: BigNumberish; // uint256型はTypeScriptではBigNumberishとして扱います
}

export interface SenderOrder {
  order: string; // bytesはTypeScriptではstringとして扱う
  signature: string;
}

export interface SenderOrderDetail {
  permit: PermitBatchTransferFrom; // この型はISignatureTransferから取得する必要がある
  transferDetails: SignatureTransferDetails[]; // この型もISignatureTransferから参照
  owner: string;
  witness: string; // bytes32もstringとして扱う
}

export interface RecipientOrder {
  order: string;
  signature: string;
}

export interface RecipientOrderDetail {
  to: string;
  amount: BigNumberish;
  id: BigNumberish;
}

export interface Witness {
  recipient: string;
}