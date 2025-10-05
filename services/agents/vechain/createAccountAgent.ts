import { IAgent, AgentResponse } from '../agentUtils';
import { ConversationContext } from '../router';

// Expected API response shape
type CreateVeChainAccountResult = {
	accountId: string; // VeChain address
	publicKey: string;
	privateKey: string;
	mnemonic: string[];
	message: string;
};

export default class CreateVeChainAccountAgent implements IAgent {
	public async execute(prompt: string, context: ConversationContext): Promise<AgentResponse> {
		console.log('[CreateVeChainAccountAgent] Executing...');

		// STATE 2: User confirmed they saved their keys
		if (prompt === 'creation_confirmed') {
			console.log('[CreateVeChainAccountAgent] User confirmed key storage. Completing task.');
			return {
				status: 'COMPLETE',
				speech: "Perfect. Your new account is ready. Let's continue.",
				ui: { type: 'LOADING', props: { text: 'Finalizing account setup...' } },
				action: { type: 'COMPLETE_GOAL' },
				context: {
					...context,
					goal: 'createAccount',
					status: 'complete',
					history: [...context.history, 'CreateVeChainAccountAgent completed successfully.'],
				},
			};
		}

		// STATE 1: Initial call — create the account via API
		try {
			console.log('[CreateVeChainAccountAgent] Calling API to create a new VeChain testnet account.');

			const isServer = typeof window === 'undefined';
			let result: CreateVeChainAccountResult;

			if (isServer) {
				// --- Node.js (Server) environment ---
				const axios = require('axios');
				const baseUrl =
					process.env.NEXT_PUBLIC_API_BASE_URL ||
					(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

				const response = await axios.default.post(`${baseUrl}/api/vechain/createAccount`, {});
				result = response.data;
			} else {
				// --- Browser environment ---
				const response = await fetch('/api/vechain/createAccount', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || 'Failed to create VeChain account via API.');
				}
				result = await response.json();
			}

			console.log(`[CreateVeChainAccountAgent] Account ${result.accountId} created successfully.`);

			return {
				status: 'AWAITING_INPUT',
				speech:
					"Success! I've created a new VeChain testnet account for you. Please copy and save your 12-word Mnemonic Phrase and Private Key in a secure password manager. This information cannot be recovered if you lose it.",
				ui: {
					type: 'LAYOUT_STACK',
					props: {
						children: [
							{
								type: 'KEY_VALUE_DISPLAY',
								props: {
									title: 'Your New VeChain Account',
									items: [
										{ key: 'Account Address', value: result.accountId },
										{ key: 'Public Key', value: result.publicKey },
										{ key: 'Private Key', value: `0x${result.privateKey}` }, // add prefix for clarity
										{ key: 'Mnemonic Phrase', value: result.mnemonic.join(' ') },
									],
								},
							},
							{
								type: 'TEXT',
								props: {
									title: '⚠️ CRITICAL SECURITY NOTICE',
									text: 'This is your only chance to save your Mnemonic Phrase and Private Key. Treat them like the keys to your entire wallet.',
								},
							},
							{
								type: 'BUTTON',
								props: {
									text: 'I have securely saved my keys. Continue.',
									payload: 'creation_confirmed',
								},
							},
						],
					},
				},
				action: { type: 'REQUEST_USER_INPUT' },
				context: {
					...context,
					collected_info: {
						...context.collected_info,
						lastCreatedVechainAddress: result.accountId,
						lastCreatedVechainPrivateKey: result.privateKey,
						lastCreatedVechainPublicKey: result.publicKey,
					},
					status: 'awaiting_user_input',
					history: [
						...context.history,
						`CreateVeChainAccountAgent created ${result.accountId} and is awaiting confirmation.`,
					],
				},
			};
		} catch (error: any) {
			console.error('[CreateVeChainAccountAgent] Error:', error);
			return {
				status: 'COMPLETE',
				speech: 'I ran into a problem while creating your VeChain account. Please try again in a moment.',
				ui: {
					type: 'TEXT',
					props: {
						title: 'VeChain Account Creation Failed',
						text: `Details: ${error.message}`,
					},
				},
				action: { type: 'COMPLETE_GOAL' },
				context: {
					...context,
					status: 'failed',
					history: [...context.history, `CreateVeChainAccountAgent failed: ${error.message}`],
				},
			};
		}
	}
}
