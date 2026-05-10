#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import YoututoraiStack from '../lib/stack.js';

const app = new App();
new YoututoraiStack(app, 'YouTutorAI', {
  env: { region: 'ap-southeast-2' }
});
