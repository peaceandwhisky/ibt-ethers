import { ethers, AbiCoder, BigNumberish } from 'ethers';
import 'dotenv/config';
import fs from "fs";
import path from "path"
import * as Interfaces from "./interface";

// 必要なパラメーター
const rpcUrl = "https://polygon-mumbai.gateway.tenderly.co"
const provider = new ethers.JsonRpcProvider(rpcUrl);

const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;
const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;
const recipientPrivateKey = process.env.RECIPIENT_PRIVATE_KEY;

const ownerAddress = "0x318990D92223F54bd9d7c5443f582D9E7855Dc6D"
const executorAddress = "0x3f3F5F719a3BE942C8Acd65b3eD51A16C46a76cF"
const recipientAddress = "0x696600D88559ac1C0E84de6208F3C568Af9e6a48";

const dbt3ContractAddress = "0x13BA675494dE227Bd0976aC3390502795F7E92A0";
const permit2ContractAddress = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const usdcContractAddress = "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23";

const ownerWallet = new ethers.Wallet(ownerPrivateKey!, provider);
const executorwallet = new ethers.Wallet(executorPrivateKey!, provider);
const recipientWallet = new ethers.Wallet(recipientPrivateKey!, provider);

const contractJsonPath = path.join(__dirname, '../DomainBasedTransferExecutor.json');
const contractJson = JSON.parse(fs.readFileSync(contractJsonPath, 'utf8'));
const abi = contractJson.abi;

const contract = new ethers.Contract(dbt3ContractAddress, abi, executorwallet);

const coder = AbiCoder.defaultAbiCoder()

async function executeTransfer() {
  const block = await provider.getBlock("latest");
  const nonce = ethers.solidityPackedKeccak256(
    ["address", "address", "uint256"],
    [dbt3ContractAddress, ownerAddress, block!.timestamp]
  )
  const amount = "1000"

  const permit: Interfaces.PermitBatchTransferFrom = {
    permitted: [
      {
        token: usdcContractAddress,
        amount: amount
      },
      {
        token: usdcContractAddress,
        amount: amount
      }
    ] as Interfaces.TokenPermissions[],
    nonce: nonce as BigNumberish,
    deadline: Math.floor(Date.now() / 1000) + 3600 as BigNumberish // 現在時刻から1時間後
  };

  const transferDetails: Interfaces.SignatureTransferDetails[] = [
    {
        to: recipientAddress,
        requestedAmount: amount
    },
    {
        to: executorAddress,
        requestedAmount: amount
    },
  ];

  const witnessData: Interfaces.Witness = { recipient: recipientAddress };
  const witness = ethers.solidityPackedKeccak256(["address"], [witnessData.recipient]);

  const domain = {
    name: "Permit2",
    version: "1",
    chainId: 80001,
    verifyingContract: permit2ContractAddress
  };

  const message = {
    to: recipientAddress,
    amount: amount,
    id: nonce
  }
  
  const senderTypes = {
    PermitBatchTransferFrom: [
        { name: 'permitted', type: 'TokenPermissions[]' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    TokenPermissions: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' }
    ]
  };

  const recipientTypes = {
    RecipientOrderDetail: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "id", type: "uint256" }
    ]
  };

  const ownerSignature = await ownerWallet.signTypedData(domain, senderTypes, permit);
  console.log("ownerSignature" + ownerSignature);

  const recipientSignature = await recipientWallet.signTypedData(domain, recipientTypes, message);
  console.log("recipientSignature" + recipientSignature);

  const senderOrder: Interfaces.SenderOrder = getSenderOrder(permit, transferDetails, ownerAddress, witness, ownerSignature)
  console.log("senderOrder" + JSON.stringify(senderOrder, null, 2))
  console.log(
    coder.decode(
      [
        "tuple(tuple(address token, uint256 amount)[] permitted, uint256 nonce, uint256 deadline)",
        "tuple(address to, uint256 requestedAmount)[]",
        "address",
        "bytes32"
      ],
      senderOrder.order
    )
  )

  const recipientOrder: Interfaces.RecipientOrder = getRecipientOrder(recipientAddress, amount, nonce, recipientSignature)
  console.log("recipientOrder" + JSON.stringify(recipientOrder, null, 2))

  try {
    const tx = await contract.execute(senderOrder, recipientOrder);
    console.log("トランザクションが送信されました:", tx.hash);
    await tx.wait();
    console.log("送金が成功しました");
  } catch (error) {
    console.error("送金の実行に失敗しました:", error);
    console.log(error.transaction.info)
  }
}

function getSenderOrder(
  permit: Interfaces.PermitBatchTransferFrom,
  transferDetails: Interfaces.SignatureTransferDetails[],
  owner: string,
  witness: string,
  signature: string
): Interfaces.SenderOrder {
  const senderOrder: Interfaces.SenderOrder = {
    order: coder.encode(
      [
          "tuple(tuple(address token, uint256 amount)[] permitted, uint256 nonce, uint256 deadline)",
          "tuple(address to, uint256 requestedAmount)[]",
          "address",
          "bytes32"
      ],
      [
          permit,
          transferDetails,
          owner,
          witness
      ]
    ),
    signature: signature
  }
  return senderOrder
}

function getRecipientOrder(
  recipientAddress: string,
  amount: BigNumberish,
  nonce: BigNumberish,
  recipientSignature: string
): Interfaces.RecipientOrder {
  const recipientOrderDetailEncoded = coder.encode(
    [
        "address",
        "uint256",
        "uint256"
    ],
    [
      recipientAddress, // 実際の`to`アドレス
      amount, // `amount`として指定する値
      nonce  // トランザクションの`id`
    ]
  );


  const recipientOrder: Interfaces.RecipientOrder = {
    order: recipientOrderDetailEncoded,
    signature: recipientSignature
  }
  return recipientOrder
}

// const getMaticBalance = async(address: string) => {
//   try {
//     // 特定のアドレスのETH残高をWei単位で取得
//     const balanceWei = await provider.getBalance(address);

//     // WeiからEtherに変換
//     const balanceEth = ethers.formatEther(balanceWei);

//     console.log(`MATIC Balance of ${address}: ${balanceEth} MATIC`);
//   } catch (error) {
//     console.error(`Error getting balance: ${error}`);
//   }
// }

// const sendEth = async () => {
//   const amountInEth = '0.1';

//   // RPC URLと秘密鍵のログを出力
//   console.log(`Admin Private Key: ${adminPrivateKey}`);
//   console.log(`RPC URL: ${rpcUrl}`);

//   // トランザクションオブジェクトを設定
//   const tx = {
//     to: recipientAddress,
//     value: ethers.parseEther(amountInEth)
//   };

//   try {
//     console.log(`Sending ${amountInEth} ETH to ${recipientAddress}...`);
//     const transactionResponse = await adminWallet.sendTransaction(tx);
//     await transactionResponse.wait(); // トランザクションが承認されるのを待機
//     console.log('Transaction confirmed: ', transactionResponse.hash);
//   } catch (error) {
//     console.error('Error sending ETH: ', error);
//   }
// };

// const sendErc20 = async () => {
//   const tokenAddress = '0x0FA8781a83E46826621b3BC094Ea2A0212e71B23';
//   const tokenAbi = [
//     "function transfer(address to, uint amount) returns (bool)"
//   ];
//   // トークンコントラクトのインスタンスを作成
//   const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, adminWallet);
//   const amountToSend = "1000000";

//   // 送金処理を実行
//   try {
//     const tx = await tokenContract.transfer(recipientAddress, amountToSend); // 'ether'はトークンの小数点に依存します。適宜変更してください。
//     console.log(`Sending ${amountToSend} tokens to ${recipientAddress}...`);
//     await tx.wait();
//     console.log('Transaction mined: ', tx.hash);
//   } catch (error) {
//     console.error('Error sending tokens: ', error);
//   }
// };

// const approveErc20 = async () => {
//   // トークンのコントラクトアドレスを設定
//   const tokenAddress = "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23";
//   const tokenAbi = [
//     "function approve(address to, uint amount) returns (bool)"
//   ];
//   // ERC20トークンコントラクトのインスタンスを作成
//   const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, ownerWallet);
//   // Maxの額をPermit2に扱えるようにさせる
//   const uint256Max: bigint = BigInt(2) ** BigInt(256) - BigInt(1);

//   // approve関数を実行
//   try {
//     const tx = await tokenContract.approve(dbt3ContractAddress, uint256Max);
//     console.log("Transaction hash:", tx.hash);

//     // トランザクションの完了を待つ
//     await tx.wait();
//     console.log("Transaction confirmed.");
//   } catch (error) {
//     console.error("Error approving tokens:", error);
//   }
// }

executeTransfer();