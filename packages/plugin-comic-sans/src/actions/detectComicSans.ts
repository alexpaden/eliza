import { elizaLogger, getEmbeddingZeroVector, stringToUuid } from "@elizaos/core";
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";

const COMIC_SANS_THRESHOLD = 0.85;
const MAX_RETRIES = 3;
const RETRY_DELAY = 12000; // 12 seconds

const MIN_FOLLOWERS = 101; // Minimum followers required (over 100)
const MIN_FOLLOWING = 101; // Minimum following required (over 100)
const MAX_LIKES_TO_TWEETS_RATIO = 10; // Likes cannot be more than 10x the tweet count

const DEFAULT_REWARD_PER_IMAGE = 10; // default reward tokens per image detection
const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // Set to 24hr by default; for testing, change DEFAULT_COOLDOWN_MS to 1000

// Helper function to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const comicImageDetection: Action = {
    name: "DETECT_COMIC_IMAGE",
    similes: [
        "CHECK_IMAGE",
        "HAS_IMAGE",
        "FIND_IMAGE",
        "IMAGE_EXISTS",
        "DETECT_MEDIA",
        "CHECK_MEDIA",
        "CHECK_COMIC",
        "DETECT_IMAGE",
    ],
    description:
        "Check if the message contains any images and detect Comic Sans in them.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        if (message.content.processed) {
            return false;
        }
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: {},
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Checking for images in message:", message);
        elizaLogger.log("Message content:", message.content);

        // Get Twitter client
        const twitterClient = runtime.clients.twitter?.client?.twitterClient;

        let profileResponse;
        try {
            profileResponse = await twitterClient.getProfile(message.content.tweetUsername as string);
            if (!profileResponse) {
                callback({ text: "Could not fetch user profile. Cannot process request.", imageUrls: [] });
                return;
            }
            elizaLogger.log("Profile:", profileResponse);

            // Validate profile against requirements to prevent spam attacks
            if (profileResponse.followersCount < MIN_FOLLOWERS) {
                elizaLogger.info("Profile validation failed: insufficient followers", profileResponse.followersCount);
                callback({ text: "Your profile does not meet the minimum followers required for detection.", imageUrls: [] });
                return;
            }
            if (profileResponse.followingCount < MIN_FOLLOWING) {
                elizaLogger.info("Profile validation failed: insufficient following", profileResponse.followingCount);
                callback({ text: "Your profile does not meet the minimum following required for detection.", imageUrls: [] });
                return;
            }
            if (profileResponse.likesCount > (profileResponse.tweetsCount * MAX_LIKES_TO_TWEETS_RATIO)) {
                elizaLogger.info("Profile validation failed: likes-to-tweets ratio too high", profileResponse.likesCount, ">", profileResponse.tweetsCount * MAX_LIKES_TO_TWEETS_RATIO);
                callback({ text: "Your profile does not meet the engagement requirements for detection.", imageUrls: [] });
                return;
            }

        } catch (error) {
            elizaLogger.error("Error fetching user profile:", error);
            callback({ text: "Error fetching user profile.", imageUrls: [] });
            return;
        }

        // Get image URLs from current message
        const currentImageUrls = message.content.imageUrls || [];

        // Check if this is a reply and get the parent message
        let parentImageUrls: string[] = [];
        if (message.content.inReplyTo) {
            const parentMessage = await runtime.messageManager.getMemoryById(
                message.content.inReplyTo
            );
            if (parentMessage) {
                elizaLogger.log(
                    "Parent message content:",
                    parentMessage.content
                );
                parentImageUrls = parentMessage.content.imageUrls || [];
            }
        }

        // Check for Comic Sans in all images
        const allImageUrls = [...currentImageUrls, ...parentImageUrls];
        const comicSansResults = await Promise.all(
            allImageUrls.map(async (url) => {
                let retries = 0;
                while (retries < MAX_RETRIES) {
                    try {
                        const response = await fetch(
                            "https://api-inference.huggingface.co/models/shoni/comic-sans-detector",
                            {
                                method: "POST",
                                headers: {
                                    Authorization: `Bearer ${runtime.getSetting("HUGGINGFACE_API_KEY")}`,
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({ url }),
                            }
                        );

                        // Retry if the service is unavailable (503)
                        if (response.status === 503) {
                            elizaLogger.log(
                                `Model is unavailable (503). Attempt ${retries + 1}/${MAX_RETRIES}`
                            );
                            if (retries === MAX_RETRIES - 1) {
                                return {
                                    url,
                                    hasComicSans: false,
                                    score: 0,
                                    error: "503 Service Unavailable",
                                };
                            }

                            await wait(RETRY_DELAY);
                            retries++;
                            continue;
                        }

                        const result = await response.json();
                        elizaLogger.log("Comic Sans detection result:", result);

                        // Retry if model is still loading
                        if (result.error && result.error.includes("loading")) {
                            const estimatedTime = result.estimated_time || 20;
                            elizaLogger.log(
                                `Model is loading. Estimated time: ${estimatedTime}s. Attempt ${
                                    retries + 1
                                }/${MAX_RETRIES}`
                            );

                            if (retries === MAX_RETRIES - 1) {
                                return {
                                    url,
                                    hasComicSans: false,
                                    score: 0,
                                    error: "Model loading timeout",
                                };
                            }

                            await wait(RETRY_DELAY);
                            retries++;
                            continue;
                        }

                        // Normal processing for valid response
                        const comicResult = result.find(
                            (r: any) => r.label === "comic"
                        );
                        const hasComicSans =
                            comicResult &&
                            comicResult.score > COMIC_SANS_THRESHOLD;

                        return {
                            url,
                            hasComicSans,
                            score: comicResult?.score || 0,
                        };
                    } catch (error) {
                        elizaLogger.error(
                            `Error checking Comic Sans for ${url}:`,
                            error
                        );
                        return {
                            url,
                            hasComicSans: false,
                            score: 0,
                            error: error.message || "Unknown error",
                        };
                    }
                }
                return {
                    url,
                    hasComicSans: false,
                    score: 0,
                    error: "Max retries reached",
                };
            })
        );

        // Updated response logic
        const responseLines = [];

        if (allImageUrls.length === 0) {
            callback({
                text: "Share an image containing Comic Sans to earn $COMICSANS rewards! 🎨",
                imageUrls: [],
            });
            return;
        }

        // Report errors if any
        const errors = comicSansResults.filter((result) => result.error);
        if (errors.length > 0) {
            responseLines.push(
                `⚠️ Some images couldn't be processed (${errors.length}/${allImageUrls.length} failed)`
            );
        }

        // Check for Comic Sans in any of the images
        const comicSansImages = comicSansResults.filter(
            (result) => result.hasComicSans
        );

        if (comicSansImages.length > 0) {
            const now = Date.now();
            const memoryId = stringToUuid(profileResponse.userId);
            elizaLogger.info("Generated user memory id", memoryId, "for Twitter user", profileResponse.userId);
            const rewardAmount = comicSansImages.length * DEFAULT_REWARD_PER_IMAGE;

            const newDetection = {
                tweetId: message.content.tweetId,
                tweetUrl: message.content.tweetUrl,
                detectedAt: now,
                imagesWithComicSans: comicSansImages.map((img) => ({ url: img.url, score: img.score })),
                rewardAmount,
                isPaidOut: false,
                claimedAt: null
            };

            let existingMemory = await runtime.messageManager.getMemoryById(memoryId);
            let detections = (existingMemory && existingMemory.content && (existingMemory.content.comicSansDetections as any[])) || [];
            elizaLogger.info("Existing comic sans detections for memory", memoryId, ":", detections);
            const cooldownMs = DEFAULT_COOLDOWN_MS;
            
            const recentDetection = detections.find((d: any) => (now - d.detectedAt) < cooldownMs);

            if (recentDetection) {
                elizaLogger.info("Cooldown active: Detection for tweet", message.content.tweetId, "not recorded. Existing detection at", recentDetection.detectedAt, "is within cooldown period (new attempt at", now, ").");
                responseLines.push("⚠️ Cooldown active: You have already recorded a Comic Sans detection within the last 24 hours. Please try again later.");
            } else {
                elizaLogger.info("No recent detection found. Cooldown expired or first time detection. Appending new detection for tweet", message.content.tweetId);
                detections.push(newDetection);
                const newMemory = {
                    id: memoryId,
                    userId: profileResponse.userId,
                    agentId: message.agentId,
                    roomId: message.roomId,
                    createdAt: existingMemory ? existingMemory.createdAt : now,
                    content: {
                        text: "ComicSans detections memory",
                        comicSansDetections: detections,
                    },
                    embedding: getEmbeddingZeroVector(),
                };

                if (existingMemory) {
                    await runtime.messageManager.removeMemory(memoryId);
                }
                await runtime.messageManager.createMemory(newMemory);
                elizaLogger.info("Created/updated comic sans memory", memoryId, "with", detections.length, "detections.");

                const highestScore = Math.max(...comicSansImages.map((img) => img.score));
                responseLines.push(`🎉 Congratulations! Comic Sans detected in ${comicSansImages.length} image(s) (highest confidence: ${(highestScore * 100).toFixed(1)}%)! You've earned ${rewardAmount} $COMICSANS!\n\nPlease reply with your Ethereum wallet address to receive your reward. 💰`);
            }
        } else {
            responseLines.push(
                "Nice try, but I don't see any Comic Sans in these images! Try again with some Comic Sans font to earn $COMICSANS rewards! ✨"
            );
        }

        callback({
            text: responseLines.join("\n"),
            imageUrls: [],
        });
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Does this message have any images with comic?" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Let me check that message for images with comic sans",
                    action: "DETECT_IMAGE",
                },
            },
        ],
    ],
} as Action;