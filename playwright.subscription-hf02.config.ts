import {defineConfig} from '@playwright/test';
// Tests the built application entry and real protected route, not a component harness.
export default defineConfig({
 testDir:'./tests/subscription-hf02',testMatch:'*.spec.ts',workers:1,timeout:30000,
 expect:{timeout:10000},outputDir:'test-results/subscription-hf02',
 reporter:[['list'],['json',{outputFile:'reports/subscription-hf02/browser.json'}]],
 use:{baseURL:'http://127.0.0.1:4193',headless:true,launchOptions:{executablePath:process.env.FOUNDATION_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']}},
 webServer:{command:'npm run preview -- --port 4193 --strictPort',url:'http://127.0.0.1:4193',reuseExistingServer:false}
});
