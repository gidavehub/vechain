import { IAgent, AgentResponse } from '../agentUtils';
import { ConversationContext } from '../router';
import { ethers } from 'ethers'; // For input validation

// The shape of the data this agent needs to collect
type SendInfo = {
  recipientAddress?: string;
  amount?: string;
};

export default class VeChainSendAgent implements IAgent {
  public async execute(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    console.log('[VeChainSendAgent] Executing...');

    let collectedInfo: SendInfo = context.collected_info.send_info || {};

    // --- State 2: Resuming after SecurityAgent has finished ---
    const securityResult = context.collected_info.specialist_results?.[0];
    if (securityResult && securityResult.context?.goal === 'security_check') {
        console.log('[VeChainSendAgent] Resuming from SecurityAgent.');
        if (securityResult.context.status === 'complete') {
            console.log('[VeChainSendAgent] Security check passed. Executing transaction.');
            // All info is collected and authorized, execute the final step.
            return this.executeTransaction(context);
        } else {
             // Security agent failed or was denied
            return {
                status: 'COMPLETE',
                speech: "Transaction cancelled due to a security failure. Please try again.",
                ui: { type: 'TEXT', props: { title: "Security Check Failed", text: "The password was incorrect or the check failed." }},
                action: { type: 'COMPLETE_GOAL' },
                context: { ...context, status: 'failed' }
            };
        }
    }

    // --- State 1: Collect Information ---
    const currentStep = context.collected_info.send_step;
    if (currentStep) {
      collectedInfo[currentStep as keyof SendInfo] = prompt;
    }

    // Find the next piece of information we need to collect
    if (!collectedInfo.recipientAddress) {
      return this.requestInfo('recipientAddress', 'Who should I send the VET to? Please provide their address.', '0x...', context);
    }

    if (!collectedInfo.amount) {
      return this.requestInfo('amount', 'How much VET should I send?', 'e.g., 10.5', context);
    }
    
    // --- State 3: Delegate for Security Approval ---
    // At this point, we have all the info. Now we delegate.
    console.log('[VeChainSendAgent] All info collected. Delegating to SecurityAgent for authorization.');
    return {
        status: 'DELEGATING',
        speech: `Alright, I'm ready to send ${collectedInfo.amount} VET to ${collectedInfo.recipientAddress.slice(0, 8)}... Just need you to authorize it.`,
        ui: { type: 'LOADING', props: { text: "Preparing for security authorization..." }},
        action: {
            type: 'DELEGATE',
            payload: {
                agent: 'utility/securityAgent',
                prompt: `Authorize sending ${collectedInfo.amount} VET.`
            }
        },
        context: {
            ...context,
            collected_info: {
                ...context.collected_info,
                send_info: collectedInfo, // Save the collected info
                send_step: null // Clear the step
            },
            status: 'delegating',
            history: [...context.history, `VeChainSendAgent is delegating to SecurityAgent.`]
        }
    };
  }

  /**
   * Generates a UARP response to ask the user for a piece of information.
   */
  private requestInfo(infoKey: keyof SendInfo, speech: string, placeholder: string, context: ConversationContext): AgentResponse {
    // Basic validation
    if (infoKey === 'recipientAddress' && context.collected_info.send_info?.recipientAddress) {
      if (!ethers.utils.isAddress(context.collected_info.send_info.recipientAddress)) {
        speech = "That doesn't look like a valid VeChain address. Please provide a valid address starting with '0x'.";
      }
    }
    if (infoKey === 'amount' && context.collected_info.send_info?.amount) {
        if (isNaN(parseFloat(context.collected_info.send_info.amount)) || parseFloat(context.collected_info.send_info.amount) <= 0) {
            speech = "Please enter a valid, positive number for the amount.";
        }
    }

    return {
      status: 'AWAITING_INPUT',
      speech: speech,
      ui: {
        type: 'TEXT_INPUT',
        props: {
          title: `Enter ${infoKey === 'recipientAddress' ? 'Recipient Address' : 'Amount (VET)'}`,
          placeholder: placeholder,
          buttonText: 'Continue',
        },
      },
      action: { type: 'REQUEST_USER_INPUT' },
      context: {
        ...context,
        collected_info: {
          ...context.collected_info,
          send_step: infoKey, // Set the current step so we know what to save next turn
        },
        status: 'awaiting_user_input',
        history: [...context.history, `VeChainSendAgent is requesting ${infoKey}.`],
      },
    };
  }

  /**
   * The final step: calls our backend API to execute the signed transaction.
   */
  private async executeTransaction(context: ConversationContext): Promise<AgentResponse> {
    const { recipientAddress, amount } = context.collected_info.send_info;
    const { privateKey } = context.collected_info; // The user's main private key

    try {
      const response = await fetch('/api/vechain/sendVet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderPrivateKey: privateKey,
          recipientAddress: recipientAddress,
          amount: amount,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Transaction failed on the server.');
      }

      // Success!
      return {
        status: 'COMPLETE',
        speech: `Success! I've sent ${amount} VET. You can view the transaction on the explorer.`,
        ui: {
            type: 'KEY_VALUE_DISPLAY',
            props: {
                title: 'Transaction Sent!',
                items: [
                    {key: 'Amount', value: `${amount} VET`},
                    {key: 'To', value: recipientAddress!},
                    {key: 'Transaction ID', value: result.transactionId, isLink: true, linkUrl: result.explorerUrl },
                ]
            }
        },
        action: { type: 'COMPLETE_GOAL' },
        context: { ...context, status: 'complete' }
      };

    } catch (error: any) {
      console.error('[VeChainSendAgent] Transaction execution error:', error);
      return {
        status: 'COMPLETE',
        speech: "I'm sorry, the transaction failed to send. Please check your balance and try again.",
        ui: { type: 'TEXT', props: { title: 'Transaction Failed', text: error.message }},
        action: { type: 'COMPLETE_GOAL' },
        context: { ...context, status: 'failed' }
      };
    }
  }
}