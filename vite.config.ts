/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  test: {
    // 业务代码直接使用浏览器 localStorage，测试需要 DOM 环境
    environment: 'jsdom',
  },
})
