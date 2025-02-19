# Comic Sans Plugin for Eliza

A plugin that detects Comic Sans font in images and rewards users with $COMICSANS tokens.

## Installation

1. Add the plugin to your agent's `agent/package.json`:
```json
{
  "dependencies": {
    "@elizaos/plugin-comic-sans": "workspace:*"
  }
}
```

2. Enable the plugin in your character file (e.g. `characters/your-character.json`):
```json
{
  "plugins": ["@elizaos/plugin-comic-sans"]
}
```

## Configuration Parameters

```env
HUGGINGFACE_API_KEY=      # Required for Comic Sans detection model
EVM_PRIVATE_KEY=          # Required for token transfers
ETHEREUM_PROVIDER_BASE=    # Base network RPC URL (optional, defaults to public RPC)
```

## Configurable Constants

### Detection (`detectComicSans.ts`)
```typescript
// Detection thresholds
COMIC_SANS_THRESHOLD = 0.85    // Minimum confidence score for detection
MAX_RETRIES = 3               // Number of HuggingFace API retries
RETRY_DELAY = 12000          // Delay between retries (ms)

// Profile requirements
MIN_FOLLOWERS = 101           // Minimum followers required
MIN_FOLLOWING = 101          // Minimum following required
MAX_LIKES_TO_TWEETS_RATIO = 10 // Maximum likes-to-tweets ratio

// Rewards and timing
DEFAULT_REWARD_PER_IMAGE = 10  // Tokens per detected image
DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000  // 24hr cooldown between rewards
```

### Transfer (`transferComicSans.ts`)
```typescript
// Contract and chain config
COMIC_SANS_TOKEN = "0x00Ef6220B7e28E890a5A265D82589e072564Cc57"  // Token address
CHAIN = "base"               // Network name
```

## Constants

- `COMIC_SANS_THRESHOLD`: 0.85 (minimum confidence score for detection)
- `DEFAULT_REWARD_PER_IMAGE`: 10 $COMICSANS tokens
- `DEFAULT_COOLDOWN_MS`: 24 hours (configurable for testing)
- `COMIC_SANS_TOKEN`: 0x00Ef6220B7e28E890a5A265D82589e072564Cc57 (on Base network)

## Profile Requirements

- Minimum 100 followers
- Minimum 100 following
- Likes-to-tweets ratio < 10x

## Logic Flow

1. **Detection**:
   - User posts image(s)
   - Check cooldown period
   - Validate Twitter profile
   - Run HuggingFace Comic Sans detection
   - Store detection results in memory

2. **Memory Structure**:
```typescript
{
  id: string;              // UUID based on userId
  content: {
    comicSansDetections: [{
      tweetId: string;
      tweetUrl: string;
      detectedAt: number;
      imagesWithComicSans: Array<{url: string, score: number}>;
      rewardAmount: number;
      isPaidOut: boolean;
      paidOutTx?: string;
      paidOutAt?: number;
      paidToAddress?: string;
    }]
  }
}
```

3. **Reward Flow**:
   - User provides ETH address
   - Check for unpaid detections
   - Transfer tokens
   - Update memory with payment status

## Error Handling

- Retries HuggingFace API calls up to 3 times
- Handles model loading states
- Validates wallet addresses
- Tracks transaction status

## Action Triggers

- `DETECT_COMIC_IMAGE`: Triggered when message contains images
- `TRANSFER_COMIC_SANS`: Triggered when message contains ETH address 