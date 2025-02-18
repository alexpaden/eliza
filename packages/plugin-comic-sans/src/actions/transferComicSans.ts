import { parseEther, type Hex, createPublicClient, createWalletClient, http, type Chain, type PublicClient, type WalletClient, type Transport, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    Plugin,
    elizaLogger,
    getEmbeddingZeroVector,
} from "@elizaos/core";
import { base } from "viem/chains";

const COMIC_SANS_TOKEN = "0x00Ef6220B7e28E890a5A265D82589e072564Cc57";
const CHAIN = "base";

// Simplified wallet provider code
function normalizePrivateKey(key: string): `0x${string}` {
    key = key.trim();
    if (!key.startsWith("0x")) {
        key = "0x" + key;
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(key)) {
        throw new Error("Invalid private key format - expected 32 bytes hex string");
    }
    return key as `0x${string}`;
}

function initWalletProvider(runtime: IAgentRuntime) {
    const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
    if (!privateKey) {
        throw new Error("EVM_PRIVATE_KEY is missing");
    }

    try {
        const normalizedKey = normalizePrivateKey(privateKey);
        const account = privateKeyToAccount(normalizedKey);
        
        const rpcUrl = runtime.getSetting("ETHEREUM_PROVIDER_" + CHAIN.toUpperCase()) || 
                      base.rpcUrls.default.http[0];

        const transport = http(rpcUrl);
        const publicClient = createPublicClient({
            chain: base as Chain,
            transport,
        });

        const walletClient = createWalletClient({
            chain: base as Chain,
            transport,
            account,
        });

        return { walletClient, publicClient };
    } catch (error) {
        throw new Error(`Failed to initialize wallet provider: ${error.message}`);
    }
}

interface ComicSansDetection {
    detectedAt: number;
    imagesWithComicSans: Array<{ url: string; score: number }>;
    rewardAmount: number;
    isPaidOut: boolean;
    paidOutTx?: string;
    paidOutAt?: number;
    paidToAddress?: string;
}

interface ComicSansMemoryContent {
    text: string;
    imageUrls?: string[];
    comicSansDetection?: ComicSansDetection;
}

async function findOriginalComicSansMessage(
    runtime: IAgentRuntime,
    message: Memory
): Promise<Memory | null> {
    // User's ETH address reply -> Bot's Comic Sans detection -> Original image post
    elizaLogger.info("Starting Comic Sans message search:", {
        messageId: message.id,
        text: message.content.text,
    });

    // 1. Get bot's response that user replied to
    const botResponse = await runtime.messageManager.getMemoryById(
        message.content.inReplyTo
    );

    if (!botResponse) {
        elizaLogger.error(message);
        console.log(message);
        console.log(message.content.inReplyTo);
        console.log(message.content);
        elizaLogger.error("Could not find bot's response");
        return null;
    }

    elizaLogger.info("Found bot response:", {
        messageId: botResponse.id,
        text: botResponse.content.text,
        hasComicSans: !!botResponse.content.comicSansDetection,
    });

    // 2. Get original message that bot replied to
    const originalMessage = await runtime.messageManager.getMemoryById(
        botResponse.content.inReplyTo
    );
    if (!originalMessage) {
        elizaLogger.error("Could not find original message");
        return null;
    }

    elizaLogger.info("Found original message:", {
        messageId: originalMessage.id,
        text: originalMessage.content.text,
        hasComicSans: !!originalMessage.content.comicSansDetection,
    });
    console.log("VVVVV: ", originalMessage);

    // Return whichever message has the comic sans detection
    return botResponse.content.comicSansDetection
        ? botResponse
        : originalMessage.content.comicSansDetection
          ? originalMessage
          : null;
}

export const transferComicSans = {
    name: "TRANSFER_COMIC_SANS",
    similes: [
        "SEND_COMIC_SANS",
        "CLAIM_REWARD",
        "GET_REWARD",
        "CLAIM_COMICSANS",
        "SEND_REWARD",
        "ETH_ADDRESS",
        "COLLECT_REWARD",
        "RECEIVE_TOKENS",
        "WALLET_ADDRESS",
        "PROCESS_ETH_ADDRESS",
        "VERIFY_ADDRESS",
        "CHECK_ADDRESS",
        "ETHEREUM_ADDRESS",
    ],
    description:
        "Accepts an ethereum address and transfers Comic Sans tokens to the user.",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const hasEthAddress = /0x[a-fA-F0-9]{40}/.test(message.content.text);
        const hasPrivateKey =
            typeof runtime.getSetting("EVM_PRIVATE_KEY") === "string" &&
            runtime.getSetting("EVM_PRIVATE_KEY").startsWith("0x");

        return hasEthAddress && hasPrivateKey;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Starting Comic Sans token transfer process...");

        try {
            // 1. Initialize wallet providers
            const { walletClient, publicClient } = initWalletProvider(runtime);
            
            // 2. Extract wallet address from reply
            const walletAddress =
                message.content.text.match(/0x[a-fA-F0-9]{40}/)?.[0];
            elizaLogger.log(
                "Extracted wallet address:",
                walletAddress || "No address found"
            );

            if (!walletAddress) {
                callback?.({
                    text: "I couldn't find a valid Ethereum address in your message. Please reply with your wallet address to receive your $COMICSANS reward.",
                });
                return false;
            }

            // 2. Find the original Comic Sans detection memory
            elizaLogger.log(
                "Looking up original memory:",
                message.content.inReplyTo
            );
            const originalMemory = await findOriginalComicSansMessage(
                runtime,
                message
            );

            if (!originalMemory) {
                elizaLogger.log("Original memory not found");
                callback?.({
                    text: "I couldn't find the original message in this conversation.",
                });
                return false;
            }

            const content = originalMemory.content as ComicSansMemoryContent;

            // 3. Check for Comic Sans detection
            elizaLogger.log("Validating Comic Sans detection:", {
                hasDetection: !!content.comicSansDetection,
                userId: originalMemory.userId,
                messageUserId: message.userId,
                isPaidOut: content.comicSansDetection?.isPaidOut,
            });

            if (!content.comicSansDetection) {
                callback?.({
                    text: "I couldn't find any pending Comic Sans rewards for this conversation. Please share images with Comic Sans first!",
                });
                return false;
            }

            // 4. Verify same user
            if (originalMemory.userId !== message.userId) {
                callback?.({
                    text: "Sorry, only the original poster can claim these rewards!",
                });
                return false;
            }

            // 5. Check if already paid
            if (content.comicSansDetection?.isPaidOut) {
                callback?.({
                    text: "These rewards have already been claimed!",
                    content: {
                        error: "already_paid",
                        paidOutTx: content.comicSansDetection.paidOutTx,
                        paidOutAt: content.comicSansDetection.paidOutAt,
                        paidToAddress: content.comicSansDetection.paidToAddress,
                    },
                });
                return false;
            }

            const rewardAmount =
                content.comicSansDetection.rewardAmount.toString();

            elizaLogger.log("Sending token transfer transaction", {
                token: COMIC_SANS_TOKEN,
                recipient: walletAddress,
                amount: rewardAmount,
            });

            let txHash: string | undefined;
            // Attempt transaction with retry logic
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const nonce = await publicClient.getTransactionCount({
                        address: walletClient.account.address,
                    });

                    txHash = await walletClient.sendTransaction({
                        account: walletClient.account,
                        to: COMIC_SANS_TOKEN,
                        data: `0xa9059cbb${walletAddress.slice(2).padStart(64, "0")}${parseEther(rewardAmount).toString(16).padStart(64, "0")}` as Hex,
                        chain: walletClient.chain,
                        nonce,
                        kzg: {
                            blobToKzgCommitment: function (
                                _: Uint8Array
                            ): Uint8Array {
                                throw new Error("Function not implemented.");
                            },
                            computeBlobKzgProof: function (
                                _blob: Uint8Array,
                                _commitment: Uint8Array
                            ): Uint8Array {
                                throw new Error("Function not implemented.");
                            },
                        },
                    });

                    // If we get here, transaction was successful
                    break;
                } catch (txError) {
                    elizaLogger.warn(
                        `Transaction attempt ${attempt + 1} failed:`,
                        txError
                    );
                    if (attempt === 2) throw txError; // Rethrow on final attempt
                    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s between attempts
                }
            }

            // Update memory regardless of transaction status
            await runtime.messageManager.removeMemory(originalMemory.id);
            await runtime.messageManager.createMemory({
                ...originalMemory,
                embedding: getEmbeddingZeroVector(),
                content: {
                    ...content,
                    comicSansDetection: {
                        ...content.comicSansDetection,
                        isPaidOut: true,
                        paidOutTx: txHash,
                        paidOutAt: Date.now(),
                        paidToAddress: walletAddress,
                    },
                },
            });

            // Only show success message if we got a transaction hash
            if (txHash) {
                callback?.({
                    text: `🎉 Successfully sent ${rewardAmount} $COMICSANS to ${walletAddress}!\n\nView transaction: https://basescan.org/tx/${txHash}`,
                    content: {
                        success: true,
                        hash: txHash,
                        amount: rewardAmount,
                        recipient: walletAddress,
                    },
                });
                return true;
            }
        } catch (error) {
            elizaLogger.error("Transfer failed:", {
                error: error.message,
                stack: error.stack,
            });
            callback?.({
                text: `Sorry, there was an error sending your rewards: ${error.message}`,
                content: { error: error.message },
            });
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Processing your Comic Sans reward claim...",
                    action: "TRANSFER_COMIC_SANS",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "It's 0x0000000000000000000000000000000000000000",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll process your Comic Sans transfer to that address.",
                    action: "TRANSFER_COMIC_SANS",
                },
            },
        ],
    ],
};