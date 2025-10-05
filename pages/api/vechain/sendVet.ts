import type { NextApiRequest, NextApiResponse } from 'next';
import { ThorClient } from '@vechain/sdk-network';
import { VeChainProvider, ProviderInternalBaseWallet } from '@vechain/sdk-core';
import { Clause, Address, VET, Transaction, HexUInt, signerUtils } from '@vechain/sdk-core';
import { ethers } from 'ethers';

const VECHAIN_TESTNET_URL = 'https://sync-testnet.vechain.org';

type SendVetRequestBody = {
  senderPrivateKey: string;
  recipientAddress: string;
  amount: string; // Amount in VET, e.g., "10.5"
};

type SendVetResponse = {
  transactionId: string;
  explorerUrl: string;
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendVetResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { senderPrivateKey, recipientAddress, amount }: SendVetRequestBody = req.body;

  if (!senderPrivateKey || !recipientAddress || !amount) {
    return res.status(400).json({ error: 'Missing required fields: senderPrivateKey, recipientAddress, and amount are required.' });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
    return res.status(400).json({ error: 'Invalid recipient address format.' });
  }
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }

  try {
    // 1. Initialize the Thor client
    const thorClient = ThorClient.at(VECHAIN_TESTNET_URL);

    // 2. Create the provider and wallet
    const senderAddress = ethers.utils.computeAddress(senderPrivateKey);
    const provider = new VeChainProvider(
      thorClient,
      new ProviderInternalBaseWallet([
        {
          privateKey: HexUInt.of(senderPrivateKey).bytes,
          address: senderAddress,
        },
      ]),
      false // fee delegation disabled
    );

    // 3. Build the clause for VET transfer
    const amountInWei = ethers.utils.parseUnits(amount, 18).toString();
    const clauses = [
      Clause.transferVET(Address.of(recipientAddress), VET.of(amountInWei)),
    ];

    // 4. Estimate gas
    const gasResult = await thorClient.gas.estimateGas(clauses, senderAddress);

    // 5. Build transaction body
    const txBody = await thorClient.transactions.buildTransactionBody(
      clauses,
      gasResult.totalGas
    );

    // 6. Sign the transaction
    const signer = await provider.getSigner(senderAddress);
    const rawSignedTransaction = await signer.signTransaction(
      signerUtils.transactionBodyToTransactionRequestInput(txBody, senderAddress)
    );
    const signedTransaction = Transaction.decode(
      HexUInt.of(rawSignedTransaction.slice(2)).bytes,
      true
    );

    // 7. Send the transaction
    const sendTransactionResult = await thorClient.transactions.sendTransaction(signedTransaction);

    const txid = sendTransactionResult.id;

    const responseData: SendVetResponse = {
      transactionId: txid,
      explorerUrl: `https://explore-testnet.vechain.org/transactions/${txid}`,
      message: `Successfully sent ${amount} VET. Transaction ID: ${txid}`,
    };

    res.status(200).json(responseData);

  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred during the transaction.';
    res.status(500).json({ error: errorMessage });
  }
}