import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Firebase Hosting serves firebase/public (see firebase/firebase.json)
    outDir: '../firebase/public',
    emptyOutDir: true,
  },
})
