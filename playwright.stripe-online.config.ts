import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/stripe-online',testMatch:'ui.spec.ts',workers:1,retries:0,timeout:30000,
 use:{baseURL:'http://127.0.0.1:5189',headless:true},outputDir:'test-results-stripe-online',reporter:[['list']],
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5189 --strictPort',url:'http://127.0.0.1:5189/tests/stripe-online/harness.html',reuseExistingServer:false,
 env:{VITE_BILLING_API_URL:'http://127.0.0.1:5189',VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:''}}
});
