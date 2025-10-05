import type { NextApiRequest, NextApiResponse } from 'next';
import { mnemonic, secp256k1, HDNode, address } from 'thor-devkit';

type CreateVeChainAccountResponse = {
  accountId: string;
  publicKey: string;
  privateKey: string;
  mnemonic: string[];
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateVeChainAccountResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Generate a new 12-word mnemonic phrase
    const mnemonicWords = mnemonic.generate();

    // 2. Derive the HDNode from the mnemonic
    const hdnode = HDNode.fromMnemonic(mnemonicWords);

    // 3. Derive the first child (m/44'/818'/0'/0/0 is default for VET)
    const child = hdnode.derive(0);

    // 4. Get private key, public key, and address
    const privateKey = child.privateKey.toString('hex');
    const publicKey = child.publicKey.toString('hex');
    const accountId = address.fromPublicKey(child.publicKey);

    const responseData: CreateVeChainAccountResponse = {
      accountId,
      publicKey: `0x${publicKey}`,
      privateKey,
      mnemonic: mnemonicWords,
      message: `Successfully created new VeChain account ${accountId}. SAVE THE MNEMONIC AND PRIVATE KEY SECURELY!`,
    };

    res.status(200).json(responseData);

  } catch (error: any) {
    const errorMessage = error.message || 'An unknown error occurred';
    res.status(500).json({ error: `Failed to create VeChain account. Reason: ${errorMessage}` });
  }
}