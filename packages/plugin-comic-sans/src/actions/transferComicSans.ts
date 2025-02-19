import { parseEther, type Hex, createPublicClient, createWalletClient, http, type Chain, type PublicClient, type WalletClient, type Transport, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    elizaLogger,
    getEmbeddingZeroVector,
    stringToUuid,
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
    tweetId: string;
    tweetUrl: string;
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
    comicSansDetections: ComicSansDetection[];
    [key: string]: any; // Add index signature to match Content type
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
            const walletAddress = message.content.text.match(/0x[a-fA-F0-9]{40}/)?.[0];
            elizaLogger.log("Extracted wallet address:", walletAddress || "No address found");

            if (!walletAddress) {
                callback?.({
                    text: "I couldn't find a valid Ethereum address in your message. Please reply with your wallet address to receive your $COMICSANS reward.",
                });
                return false;
            }

            // 3. Get Twitter client and fetch profile
            const twitterClient = runtime.clients.twitter?.client?.twitterClient;
            if (!twitterClient) {
                callback?.({ text: "Twitter client not available." });
                return false;
            }

            let profileResponse;
            try {
                profileResponse = await twitterClient.getProfile(message.content.tweetUsername as string);
                if (!profileResponse) {
                    callback?.({ text: "Could not fetch user profile. Cannot process request." });
                    return false;
                }
                elizaLogger.log("Profile:", profileResponse);
            } catch (error) {
                elizaLogger.error("Error fetching user profile:", error);
                callback?.({ text: "Error fetching user profile." });
                return false;
            }

            // 4. Get user's comic sans memory
            const memoryId = stringToUuid(profileResponse.userId);
            const userMemory = await runtime.messageManager.getMemoryById(memoryId);
            
            if (!userMemory) {
                callback?.({ text: "No Comic Sans detections found for your account." });
                return false;
            }

            const content = userMemory.content as unknown as ComicSansMemoryContent;
            const unpaidDetections = content.comicSansDetections.filter(d => !d.isPaidOut);

            if (unpaidDetections.length === 0) {
                callback?.({ text: "No unpaid Comic Sans rewards found for your account." });
                return false;
            }

            // 5. Process each unpaid detection
            let successfulTransfers = 0;
            let totalAmountTransferred = 0;
            let failedTransfers = 0;

            // Get initial nonce
            let currentNonce = await publicClient.getTransactionCount({
                address: walletClient.account.address,
            });

            for (const detection of unpaidDetections) {
                try {
                    elizaLogger.log("Processing transfer for detection:", {
                        tweetId: detection.tweetId,
                        amount: detection.rewardAmount,
                        nonce: currentNonce,
                    });

                    const txHash = await walletClient.sendTransaction({
                        account: walletClient.account,
                        to: COMIC_SANS_TOKEN,
                        data: `0xa9059cbb${walletAddress.slice(2).padStart(64, "0")}${parseEther(detection.rewardAmount.toString()).toString(16).padStart(64, "0")}` as Hex,
                        chain: walletClient.chain,
                        nonce: currentNonce++, // Increment nonce for next transaction
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

                    // Update memory for this specific detection
                    detection.isPaidOut = true;
                    detection.paidOutTx = txHash;
                    detection.paidOutAt = Date.now();
                    detection.paidToAddress = walletAddress;

                    // Update memory after each successful transfer
                    await runtime.messageManager.removeMemory(memoryId);
                    await runtime.messageManager.createMemory({
                        ...userMemory,
                        embedding: getEmbeddingZeroVector(),
                        content,
                    });

                    successfulTransfers++;
                    totalAmountTransferred += detection.rewardAmount;
                    
                    elizaLogger.info("Successfully processed transfer:", {
                        tweetId: detection.tweetId,
                        txHash,
                        amount: detection.rewardAmount,
                    });
                } catch (error) {
                    elizaLogger.error("Transfer failed for detection:", {
                        tweetId: detection.tweetId,
                        error: error.message,
                    });
                    failedTransfers++;
                }
            }

            // 6. Send summary response
            if (successfulTransfers > 0) {
                callback?.({
                    text: `🎉 Successfully sent ${totalAmountTransferred} $COMICSANS to ${walletAddress}!\n\n` +
                         `Processed ${successfulTransfers} reward${successfulTransfers !== 1 ? 's' : ''}` +
                         (failedTransfers > 0 ? ` (${failedTransfers} failed)` : '') +
                         `\n\nView your transactions on Basescan!`,
                });
                return true;
            } else {
                callback?.({
                    text: `❌ Failed to process any transfers. Please try again later.`,
                });
                return false;
            }
        } catch (error) {
            elizaLogger.error("Transfer process failed:", {
                error: error.message,
                stack: error.stack,
            });
            callback?.({
                text: `Sorry, there was an error processing your rewards: ${error.message}`,
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