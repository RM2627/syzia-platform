import {defineConfig} from '@playwright/test';
import demo from './playwright.demo.config';
export default defineConfig({...demo,testMatch:'syzia-048.spec.ts',timeout:90000,retries:0,outputDir:'test-results-048',
 reporter:[['list'],['json',{outputFile:'reports/syzia-048/browser.json'}]],
 use:{...demo.use,trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{...demo.webServer,env:{DEMO_TEST_MODE:'true',DEMO_MINIMAL:'true',DEMO_NO_MANUAL_048:'true'}},
});
