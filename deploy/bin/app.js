#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import YoututoraiStack from "../lib/stack.js";

const app = new App();

const stage = app.node.tryGetContext("stage") ?? "prod";
const account = process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID;
const region = process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? "ap-southeast-2";
const domainName =
  app.node.tryGetContext("domainName") ??
  process.env.YTAI_DOMAIN_NAME ??
  "yoututorai.techseeding.com.au";
const hostedZoneName =
  app.node.tryGetContext("hostedZoneName") ??
  process.env.YTAI_HOSTED_ZONE_NAME ??
  "techseeding.com.au";
const imageTag =
  app.node.tryGetContext("imageTag") ?? process.env.IMAGE_TAG ?? "latest";
const appRepoName =
  app.node.tryGetContext("appRepoName") ?? process.env.APP_REPO_NAME ?? "ytai";
const imageRetentionDays = Number(
  app.node.tryGetContext("imageRetentionDays") ??
    process.env.YTAI_IMAGE_RETENTION_DAYS ??
    30,
);

// Imports from kpai-prod's CFN outputs. The release script populates these
// via `aws cloudformation describe-stacks --stack-name kpai-${stage}` before
// invoking `cdk deploy`. Passing them as context — rather than using
// Fn.importValue — keeps the values resolvable at synth time, which CDK
// constructs like Vpc.fromVpcAttributes require.
function ctx(key, envKey) {
  const v = app.node.tryGetContext(key) ?? process.env[envKey];
  if (!v) {
    throw new Error(
      `Missing context '${key}' (or env '${envKey}'). Populate from kpai-${stage} CFN outputs.`,
    );
  }
  return v;
}

const kpaiImports = {
  vpcId: ctx("vpcId", "KPAI_VPC_ID"),
  clusterName: ctx("clusterName", "KPAI_CLUSTER_NAME"),
  capacityProviderName: ctx("capacityProviderName", "KPAI_CAPACITY_PROVIDER_NAME"),
  albArn: ctx("albArn", "KPAI_ALB_ARN"),
  albDnsName: ctx("albDnsName", "KPAI_ALB_DNS_NAME"),
  albCanonicalHostedZoneId: ctx(
    "albCanonicalHostedZoneId",
    "KPAI_ALB_CANONICAL_HOSTED_ZONE_ID",
  ),
  albHttpsListenerArn: ctx("albHttpsListenerArn", "KPAI_ALB_HTTPS_LISTENER_ARN"),
  albSgId: ctx("albSgId", "KPAI_ALB_SG_ID"),
  dbHost: ctx("dbHost", "KPAI_DB_HOST"),
  dbPort: app.node.tryGetContext("dbPort") ?? process.env.KPAI_DB_PORT ?? "5432",
  dbSecretArn: ctx("dbSecretArn", "KPAI_DB_SECRET_ARN"),
};

new YoututoraiStack(app, `ytai-${stage}`, {
  env: { account, region },
  stage,
  domainName,
  hostedZoneName,
  appRepoName,
  imageTag,
  imageRetentionDays,
  ...kpaiImports,
});

Tags.of(app).add("Project", "ytai");
Tags.of(app).add("Stage", stage);
