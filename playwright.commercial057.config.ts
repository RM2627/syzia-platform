import {defineConfig} from '@playwright/test';
import base from './playwright.commercial056.config';
export default defineConfig({...base,testMatch:'commercial057.spec.ts',outputDir:'test-results-commercial057',reporter:[['list'],['json',{outputFile:'reports/syzia-057/browser.json'}]],webServer:{...base.webServer,env:{...base.webServer.env,DEMO_COMMERCIAL_057:'true'}}});
