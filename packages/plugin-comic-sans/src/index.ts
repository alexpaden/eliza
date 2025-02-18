import { Plugin } from "@elizaos/core";
import { comnicImageDetection } from "./actions/detectComicSans";
import { transferComicSans } from "./actions/transferComicSans";

export const comicSansPlugin: Plugin = {
    name: "comicSansPlugin",
    description: "Comic Sans detection and reward plugin",
    actions: [transferComicSans, comnicImageDetection],
    evaluators: [],
    providers: [],
};

export { comnicImageDetection, transferComicSans };