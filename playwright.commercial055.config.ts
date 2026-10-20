import {defineConfig}from'@playwright/test';
import base from './playwright.demo.config';
export default defineConfig({...base,testMatch:'commercial055.spec.ts',timeout:120000,outputDir:'test-results-commercial055',reporter:[['list'],['json',{outputFile:'reports/syzia-055/browser.json'}]],webServer:{...base.webServer,timeout:120000,env:{DEMO_TEST_MODE:'true',DEMO_MINIMAL:'true',DEMO_BILLING_047:'true',DEMO_COMMERCIAL_055:'true'}},use:{...base.use,trace:'retain-on-failure',screenshot:'only-on-failure'}});
