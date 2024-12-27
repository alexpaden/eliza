import { Plugin } from "@elizaos/core";
import { comnicImageDetection } from "./actions/imageDetection";
import { transferComicSans } from "./actions/transfer";

export const comicSansPlugin: Plugin = {
    name: "comicSansPlugin",
    description: "comic sans ai/crypto plugin.",
    actions: [transferComicSans, comnicImageDetection],
    evaluators: [],
    providers: [],
};

export { comnicImageDetection, transferComicSans };
