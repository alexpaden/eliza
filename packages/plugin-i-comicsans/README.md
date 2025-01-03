# @elizaos/plugin-i-comicsans

A Comic Sans detection and reward plugin for the ElizaOS framework. This plugin rewards users with $COMICSANS tokens when they share images containing Comic Sans text.

## Features

- 🔍 Real-time Comic Sans detection using a fine-tuned ResNet-18 model via Hugging Face Inference API
- 💰 Automatic $COMICSANS token rewards on Base L2
- 🎨 Works with any ElizaOS client that supports media attachments
- 🔄 Built-in retry mechanism for both AI inference and blockchain transactions
- 💾 Persistent memory storage for tracking rewards and payments

## Setup

1. Install the plugin:

    ```
    npm install @elizaos/plugin-i-comicsans
    ```

2. Configure environment variables:

    ```
    HUGGINGFACE_API_KEY=your_api_key
    EVM_PRIVATE_KEY=your_wallet_private_key
    ```

3. Add to your ElizaOS configuration:

    ```typescript
    import { comicSansPlugin } from "@elizaos/plugin-i-comicsans";

    // Add to your plugins array
    plugins: [
        comicSansPlugin,
        // ... other plugins
    ];
    ```

## Usage

1. Users can tag your bot with any image containing Comic Sans text
2. The plugin will analyze the image using the Comic Sans detector model
3. If Comic Sans is detected (confidence > 85%), the user earns 10 $COMICSANS tokens per image
4. Users can claim their rewards by replying with their Ethereum wallet address
5. Tokens are automatically transferred on the Base L2 network

## Technical Details

- **Model**: [shoni/comic-sans-detector](https://huggingface.co/shoni/comic-sans-detector) - Custom ResNet-18 fine-tuned for Comic Sans detection
- **Token**: $COMICSANS ERC20 (`0x00Ef6220B7e28E890a5A265D82589e072564Cc57`)
- **Network**: Base L2
- **Reward**: 10 $COMICSANS per detected image
- **Detection Threshold**: 85% confidence

## Memory Structure

The plugin stores Comic Sans detection results and reward status in the message memory:

```typescript
{
  content: {
    text: string,
    attachments: Array<{
      id: string,
      url: string,
      contentType: string,
      // ... other metadata
    }>,
    comicSansDetection: {
      detectedAt: number,          // Timestamp of detection
      imagesWithComicSans: Array<{ // Array of detected images
        url: string,
        score: number
      }>,
      rewardAmount: number,        // Amount of tokens to reward
      isPaidOut: boolean,          // Payment status
      paidOutTx?: string,         // Transaction hash if paid
      paidOutAt?: number,         // Payment timestamp
      paidToAddress?: string      // Recipient address
    }
  }
}
```

## Client Integration

The plugin works with any ElizaOS client that properly populates the standard attachment format in message memories. For example, to add support to the Twitter client, we updated:

- `utils.ts`: Added photo attachment mapping in `buildConversationThread()`
- `interactions.ts`: Updated tweet processing to include media attachments

Example attachment format:

```typescript
attachments: [
    {
        id: string,
        url: string,
        title: "",
        source: "twitter", // or other client name
        description: "",
        text: "",
        contentType: "image/jpeg",
    },
];
```

This standardized format allows the Comic Sans detector to work seamlessly across different clients (Twitter, Discord, etc.) as long as they properly populate the attachment metadata.

## Model Training & Development

The Comic Sans detection model is available on Hugging Face and can be:

- Used directly via the Inference API (as this plugin does)
- Downloaded for local inference
- Retrained on custom data using the provided notebooks
- Extended or modified for your needs

Check out the [model repository](https://huggingface.co/shoni/comic-sans-detector) for:

- Training notebooks
- Dataset structure guidelines
- API usage examples
- Model architecture details

## License

MIT.
