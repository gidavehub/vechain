import { AgentResponse, IAgent } from '../agentUtils';
import { ConversationContext } from '../router';

// This is the "shape" of the information this agent needs to collect.
// MODIFICATION: "accountId" is now "address" for VeChain's 0x... format.
const REQUIRED_INFO = ["name", "password", "address", "privateKey"];

export default class OnboardingAgent implements IAgent {
  public async execute(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    console.log('[OnboardingAgent] Executing...');
    let updatedContext = { ...context };

    // --- State Logic: Handle user responses from previous turns ---
    const currentStepKey = context.collected_info.onboarding_step;

    if (currentStepKey && currentStepKey !== 'account_id_choice') {
      updatedContext.collected_info[currentStepKey] = prompt;
    }

    // --- State Logic: Handle the choice between creating/providing an account ---
    if (currentStepKey === 'account_id_choice') {
      if (prompt === 'create_new_account') {
        // User wants a new account. Delegate to the createAccountAgent.
        return this.delegateToCreateAccount(updatedContext);
      }
      if (prompt === 'provide_existing_account') {
        // User has an account. We must immediately ask for their address.
        updatedContext.collected_info.onboarding_step = null;
        // Then, we explicitly call the next question instead of letting the logic fall through.
        return this.generateQuestionResponse('address', updatedContext);
      }
    }
    
    // --- State Logic: Handle resuming after account creation ---
    const createAccountResult = context.collected_info.specialist_results?.[0];
    if (createAccountResult && createAccountResult.context?.goal === 'createAccount') {
        console.log('[OnboardingAgent] Resuming from CreateAccountAgent result.');
        // MODIFICATION: Look for VeChain-specific keys from the createAccountAgent's context.
        const { lastCreatedAddress, lastCreatedAccountPrivateKey } = createAccountResult.context.collected_info;
        if (lastCreatedAddress && lastCreatedAccountPrivateKey) {
            updatedContext.collected_info.address = lastCreatedAddress;
            updatedContext.collected_info.privateKey = lastCreatedAccountPrivateKey;
            delete updatedContext.collected_info.specialist_results;
        }
    }

    // --- Main Logic: Find the next piece of info to collect ---
    const nextInfoToCollect = REQUIRED_INFO.find(info => !updatedContext.collected_info[info]);

    if (nextInfoToCollect) {
      // This is now the first entry point for the address question, triggering the choice.
      if (nextInfoToCollect === 'address') {
        return this.generateAccountChoiceResponse(updatedContext);
      }
      // For all other info, use the standard question generator.
      return this.generateQuestionResponse(nextInfoToCollect, updatedContext);
    } else {
      // If we have everything, generate the final success response.
      return this.generateCompletionResponse(updatedContext);
    }
  }

  private generateAccountChoiceResponse(context: ConversationContext): AgentResponse {
    // MODIFICATION: Reference "address" instead of "accountId" for step calculation
    const currentStep = REQUIRED_INFO.indexOf('address') + 1;
    const totalSteps = REQUIRED_INFO.length;

    return {
      status: 'AWAITING_INPUT',
      // MODIFICATION: Updated text for VeChain
      speech: "Great. Now, do you already have a VeChain address and private key, or would you like me to create a new one for you?",
      ui: {
        type: 'LAYOUT_STACK',
        props: {
          children: [
            {
              type: 'STEPPER',
              props: {
                currentStep: currentStep,
                totalSteps: totalSteps,
                title: "Account Setup"
              }
            },
            {
              type: 'TEXT',
              // MODIFICATION: Updated text for VeChain
              props: {
                title: "VeChain Wallet",
                text: "To interact with the network, you need a VeChain wallet. You can provide your existing credentials or create a new, free testnet wallet."
              }
            },
            {
              type: 'BUTTON_GROUP',
              props: {
                buttons: [
                  { text: "I have a wallet", payload: "provide_existing_account" },
                  { text: "Create a new wallet", payload: "create_new_account" },
                ]
              }
            }
          ]
        }
      },
      action: { type: 'REQUEST_USER_INPUT' },
      context: {
        ...context,
        collected_info: {
          ...context.collected_info,
          onboarding_step: 'account_id_choice', // Internal step name can remain
        },
        status: 'awaiting_user_input',
        history: [...context.history, `OnboardingAgent is asking for wallet choice.`],
      },
    };
  }

  private delegateToCreateAccount(context: ConversationContext): AgentResponse {
    return {
      status: 'DELEGATING',
      // MODIFICATION: Updated text for VeChain
      speech: "Excellent! I'll create a new secure testnet wallet for you now. One moment.",
      ui: {
        type: 'LOADING',
        props: {
          // MODIFICATION: Updated text for VeChain
          text: "Generating new VeChain wallet..."
        }
      },
      action: {
        type: 'DELEGATE',
        payload: {
          agent: 'vechain/createAccountAgent',
          // MODIFICATION: Updated prompt for VeChain
          prompt: 'The user wants to create a new VeChain wallet during onboarding.'
        }
      },
      context: {
        ...context,
        status: 'delegating',
        history: [...context.history, 'OnboardingAgent is delegating to CreateAccountAgent.'],
      }
    };
  }

  private generateQuestionResponse(infoNeeded: string, context: ConversationContext): AgentResponse {
    const currentStep = REQUIRED_INFO.indexOf(infoNeeded) + 1;
    const totalSteps = REQUIRED_INFO.length;
    
    // MODIFICATION: Renamed "accountId" to "address"
    const emojiMap: Record<string, string> = {
      name: '🧑',
      address: '🆔',
      privateKey: '🔑',
      password: '🔢',
    };
    
    // MODIFICATION: Renamed "accountId" to "address" and updated placeholder
    const placeholderMap: Record<string, string> = {
      name: 'Enter your name...',
      address: 'Enter your VeChain address (e.g., 0x...).',
      privateKey: 'Paste your private key...',
    };

    // MODIFICATION: Renamed "accountId" to "address" and updated speech
    const speechMap: Record<string, string> = {
      name: "Let's get started! What's your name?",
      address: "What's your VeChain address?",
      privateKey: "Please provide your private key. Don't worry, it will be encrypted locally on your device and never stored on a server.",
      password: "Finally, set a numeric password for signing transactions. Make it memorable!",
    };
    
    let uiComponent: any;

    if (infoNeeded === 'password') {
        uiComponent = {
            type: 'NUMERIC_KEYPAD_INPUT',
            props: {
                title: 'Set Your Password',
                emoji: emojiMap[infoNeeded],
            }
        };
    } else {
        uiComponent = {
            type: 'TEXT_INPUT',
            props: {
                // MODIFICATION: Updated title logic for "address"
                title: infoNeeded === 'name' ? 'Your Name' : (infoNeeded === 'address' ? 'VeChain Address' : 'Private Key'),
                placeholder: placeholderMap[infoNeeded],
                buttonText: 'Submit',
                inputType: infoNeeded === 'privateKey' ? 'password' : 'text',
                emoji: emojiMap[infoNeeded],
            }
        };
    }

    return {
      status: 'AWAITING_INPUT',
      speech: speechMap[infoNeeded],
      ui: {
        type: 'LAYOUT_STACK',
        props: {
          children: [
            {
              type: 'STEPPER',
              props: { currentStep, totalSteps, title: 'Onboarding Progress' }
            },
            uiComponent
          ]
        }
      },
      action: { type: 'REQUEST_USER_INPUT' },
      context: {
        ...context,
        collected_info: {
          ...context.collected_info,
          onboarding_step: infoNeeded,
        },
        status: 'awaiting_user_input',
        history: [...context.history, `OnboardingAgent is requesting '${infoNeeded}'.`],
      },
    };
  }

  private generateCompletionResponse(context: ConversationContext): AgentResponse {
    // MODIFICATION: Destructure "address" instead of "accountId"
    const { name, address, privateKey, password } = context.collected_info;
    
    return {
      status: 'COMPLETE',
      speech: `All set, ${name}! I've securely encrypted and saved your credentials on this device. You're ready to command the network.`,
      ui: {
        type: 'KEY_VALUE_DISPLAY',
        props: {
          title: 'Setup Complete!',
          items: [
            { key: "Name", value: name },
            // MODIFICATION: Display "VeChain Address"
            { key: "VeChain Address", value: address },
            { key: "Status", value: "Credentials saved and encrypted locally." }
          ]
        },
      },
      action: {
        type: 'SAVE_CREDENTIALS',
        // MODIFICATION: Save "address" in the payload
        payload: { name, address, privateKey, password },
      },
      context: {
        ...context,
        collected_info: { 
          ...context.collected_info,
        },
        status: 'complete',
        goal: 'onboarding_complete',
        history: [...context.history, 'OnboardingAgent completed successfully.'],
      },
    };
  }
}