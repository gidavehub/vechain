import type { NextApiRequest, NextApiResponse } from 'next';
import { ThorClient } from '@vechain/sdk-network';
import { ethers } from 'ethers';

const VECHAIN_TESTNET_URL = 'https://sync-testnet.vechain.org';

type BalanceResponse = {
  vet: string;
  vtho: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BalanceResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { address } = req.query;

  if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'A valid VeChain address (0x...) is required.' });
  }

  try {
    const thorClient = ThorClient.at(VECHAIN_TESTNET_URL);

    const account = await thorClient.accounts.getAccount(address);

    // account.balance and account.energy are hex strings representing wei values
    const vetBalance = ethers.utils.formatUnits(BigInt(account.balance), 18);
    const vthoBalance = ethers.utils.formatUnits(BigInt(account.energy), 18);

    res.status(200).json({
      vet: vetBalance,
      vtho: vthoBalance,
    });
  } catch (error: any) {
    // If the account does not exist, return zero balances
    if (error.status === 404) {
      return res.status(200).json({ vet: "0.0", vtho: "0.0" });
    }
    res.status(500).json({ error: error.message || 'An unknown error occurred while fetching the balance.' });
  }
}