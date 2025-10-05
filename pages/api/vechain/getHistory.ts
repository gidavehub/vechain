import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

// The base URL for the VeChainStats API
const VCS_API_URL = 'https://api.vechainstats.com/v2';

// Define the structure of the simplified transaction data we'll return to our agent
export type SimplifiedTransaction = {
  id: string;
  timestamp: number;
  origin: string;
  clauses: {
    to: string | null; // Can be null for contract creation
    value: string; // VET value transferred
    data: string;
  }[];
};

// The structure of our API's successful response
type HistoryResponse = {
  transactions: SimplifiedTransaction[];
};

// Validate that the VeChainStats API key is set in the environment variables.
if (!process.env.VCS_API_KEY) {
  throw new Error("CRITICAL: VCS_API_KEY is not set in environment variables.");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HistoryResponse | { error: string }>
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
    console.log(`API: Fetching transaction history for VeChain address: ${address}`);

    // 1. Make the authenticated request to the VeChainStats API
    const response = await axios.get(`${VCS_API_URL}/accounts/${address}/transactions`, {
      headers: {
        'X-API-Key': process.env.VCS_API_KEY, // Use the API key from your server's environment
      },
      // You can add more query params here for pagination, e.g., limit, offset
      params: {
        limit: 10, // Let's fetch the 10 most recent transactions
      }
    });

    // 2. The VCS API returns a lot of data. We simplify it for our agent.
    const simplifiedTransactions: SimplifiedTransaction[] = response.data.map((tx: any) => ({
      id: tx.id,
      timestamp: tx.timestamp,
      origin: tx.origin,
      clauses: tx.clauses.map((clause: any) => ({
        to: clause.to,
        value: clause.value, // This is already in VET, but as a hex string
        data: clause.data,
      })),
    }));

    const responseData: HistoryResponse = {
      transactions: simplifiedTransactions,
    };

    res.status(200).json(responseData);

  } catch (error: any) {
    console.error(`API Error: Failed to get tx history for ${address}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch transaction history from VeChainStats.';
    res.status(error.response?.status || 500).json({ error: errorMessage });
  }
}