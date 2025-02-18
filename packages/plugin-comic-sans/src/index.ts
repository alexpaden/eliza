import { Plugin } from "@elizaos/core";
import { comicImageDetection } from "./actions/detectComicSans";
import { transferComicSans } from "./actions/transferComicSans";

export const comicSansPlugin: Plugin = {
    name: "comicSansPlugin",
    description: "Comic Sans detection and reward plugin",
    actions: [transferComicSans, comicImageDetection],
    evaluators: [],
    providers: [],
};

export { comicImageDetection, transferComicSans };