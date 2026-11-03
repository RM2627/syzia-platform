import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/subscription-ui',testMatch:'*.spec.ts',workers:1,timeout:30000,
 expect:{timeout:10000},outputDir:'test-results/subscription-ui',
 reporter:[['list'],['json',{outputFile:'reports/subscription-ui/browser.json'}]],
 use:{baseURL:'http://127.0.0.1:4192',headless:true,launchOptions:{executablePath:process.env.FOUNDATION_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4192 --strictPort',url:'http://127.0.0.1:4192',reuseExistingServer:false,env:{VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_ui_test',VITE_PLATFORM_API_URL:'http://127.0.0.1:54321',VITE_BILLING_API_URL:'http://127.0.0.1:54321'}}
});
