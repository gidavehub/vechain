import { AgentResponse, IAgent } from '../agentUtils';
import { ConversationContext } from '../router';

// The information this agent needs to collect
const REQUIRED_INFO = ["name", "password", "address", "privateKey"];

export default class OnboardingAgent implements IAgent {
  public async execute(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    console.log('[OnboardingAgent] Executing...');
    let updatedContext = { ...context };

    // --- Handle user responses from previous turns ---
    const currentStepKey = context.collected_info.onboarding_step;

    if (currentStepKey && currentStepKey !== 'account_id_choice') {
      updatedContext.collected_info[currentStepKey] = prompt;
    }

    // --- Handle the choice between creating/providing an account ---
    if (currentStepKey === 'account_id_choice') {
      if (prompt === 'create_new_account') {
        // User wants to create a new VeChain account
        return this.delegateToCreateAccount(updatedContext);
      }
      if (prompt === 'provide_existing_account') {
        // User already has a wallet, ask for address next
        updatedContext.collected_info.onboarding_step = null;
        return this.generateQuestionResponse('address', updatedContext);
      }
    }

    // --- Handle resuming after account creation ---
    const createAccountResult = context.collected_info.specialist_results?.[0];
    if (createAccountResult && createAccountResult.context?.goal === 'createAccount') {
      console.log('[OnboardingAgent] Resuming from CreateVeChainAccountAgent result.');

      const { lastCreatedVechainAddress, lastCreatedVechainPrivateKey } =
        createAccountResult.context.collected_info;

      if (lastCreatedVechainAddress && lastCreatedVechainPrivateKey) {
        updatedContext.collected_info.address = lastCreatedVechainAddress;
        updatedContext.collected_info.privateKey = lastCreatedVechainPrivateKey;

        // Remove specialist results after consuming them
        delete updatedContext.collected_info.specialist_results;
      }
    }

    // --- Determine the next piece of info to collect ---
    const nextInfoToCollect = REQUIRED_INFO.find(
      (info) => !updatedContext.collected_info[info]
    );

    if (nextInfoToCollect) {
      // Handle the address step — trigger wallet choice UI
      if (nextInfoToCollect === 'address') {
        return this.generateAccountChoiceResponse(updatedContext);
      }

      // For all other fields, use the generic question generator
      return this.generateQuestionResponse(nextInfoToCollect, updatedContext);
    }

    // --- All info collected — finish onboarding ---
    return this.generateCompletionResponse(updatedContext);
  }

  // --- UI: Wallet Choice (create or provide) ---
  private generateAccountChoiceResponse(context: ConversationContext): AgentResponse {
    const currentStep = REQUIRED_INFO.indexOf('address') + 1;
    const totalSteps = REQUIRED_INFO.length;

    return {
      status: 'AWAITING_INPUT',
      speech:
        "Great. Now, do you already have a VeChain wallet, or would you like me to create a new one for you?",
      ui: {
        type: 'LAYOUT_STACK',
        props: {
          children: [
            {
              type: 'STEPPER',
              props: {
                currentStep,
                totalSteps,
                title: "Account Setup",
              },
            },
            {
              type: 'TEXT',
              props: {
                title: "VeChain Wallet",
                text: "To interact with the network, you need a VeChain wallet. You can provide your existing credentials or create a new, free testnet wallet.",
              },
            },
            {
              type: 'BUTTON_GROUP',
              props: {
                buttons: [
                  { text: "I have a wallet", payload: "provide_existing_account" },
                  { text: "Create a new wallet", payload: "create_new_account" },
                ],
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
          onboarding_step: 'account_id_choice',
        },
        status: 'awaiting_user_input',
        history: [...context.history, `OnboardingAgent is asking for wallet choice.`],
      },
    };
  }

  // --- Delegate to CreateVeChainAccountAgent ---
  private delegateToCreateAccount(context: ConversationContext): AgentResponse {
    return {
      status: 'DELEGATING',
      speech: "Excellent! I'll create a new secure VeChain testnet wallet for you now. One moment.",
      ui: {
        type: 'LOADING',
        props: {
          text: "Generating new VeChain wallet...",
        },
      },
      action: {
        type: 'DELEGATE',
        payload: {
          agent: 'vechain/createAccountAgent',
          prompt: 'The user wants to create a new VeChain wallet during onboarding.',
        },
      },
      context: {
        ...context,
        status: 'delegating',
        history: [...context.history, 'OnboardingAgent is delegating to CreateVeChainAccountAgent.'],
      },
    };
  }

  // --- Generate a UI question for a given field ---
  private generateQuestionResponse(infoNeeded: string, context: ConversationContext): AgentResponse {
    const currentStep = REQUIRED_INFO.indexOf(infoNeeded) + 1;
    const totalSteps = REQUIRED_INFO.length;

    const emojiMap: Record<string, string> = {
      name: '🧑',
      address: '🆔',
      privateKey: '🔑',
      password: '🔢',
    };

    const placeholderMap: Record<string, string> = {
      name: 'Enter your name...',
      address: 'Enter your VeChain address (e.g., 0x...)',
      privateKey: 'Paste your private key...',
    };

    const speechMap: Record<string, string> = {
      name: "Let's get started! What's your name?",
      address: "What's your VeChain address?",
      privateKey:
        "Please provide your private key. Don't worry — it will be encrypted locally on your device and never stored on a server.",
      password: "Finally, set a numeric password for signing transactions. Make it memorable!",
    };

    let uiComponent: any;

    if (infoNeeded === 'password') {
      uiComponent = {
        type: 'NUMERIC_KEYPAD_INPUT',
        props: {
          title: 'Set Your Password',
          emoji: emojiMap[infoNeeded],
        },
      };
    } else {
      uiComponent = {
        type: 'TEXT_INPUT',
        props: {
          title:
            infoNeeded === 'name'
              ? 'Your Name'
              : infoNeeded === 'address'
              ? 'VeChain Address'
              : 'Private Key',
          placeholder: placeholderMap[infoNeeded],
          buttonText: 'Submit',
          inputType: infoNeeded === 'privateKey' ? 'password' : 'text',
          emoji: emojiMap[infoNeeded],
        },
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
              props: { currentStep, totalSteps, title: 'Onboarding Progress' },
            },
            uiComponent,
          ],
        },
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

  // --- Final step: all data collected ---
  private generateCompletionResponse(context: ConversationContext): AgentResponse {
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
            { key: "VeChain Address", value: address },
            { key: "Status", value: "Credentials saved and encrypted locally." },
          ],
        },
      },
      action: {
        type: 'SAVE_CREDENTIALS',
        payload: { name, address, privateKey, password },
      },
      context: {
        ...context,
        collected_info: { ...context.collected_info },
        status: 'complete',
        goal: 'onboarding_complete',
        history: [...context.history, 'OnboardingAgent completed successfully.'],
      },
    };
  }
}
