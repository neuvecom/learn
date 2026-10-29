// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages（カスタムドメイン neuve.com）の /learn/ で公開する前提の設定
export default defineConfig({
    site: 'https://neuve.com',
    base: '/learn',
    trailingSlash: 'always',
});
