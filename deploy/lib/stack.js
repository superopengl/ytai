import { Stack, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Vpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import {
  Cluster,
  Ec2TaskDefinition,
  Ec2Service,
  NetworkMode,
  ContainerImage,
  Secret as EcsSecret,
  LogDrivers,
} from "aws-cdk-lib/aws-ecs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import {
  ApplicationLoadBalancer,
  ApplicationListener,
  ApplicationTargetGroup,
  ApplicationProtocol,
  ApplicationListenerRule,
  ListenerAction,
  ListenerCondition,
  TargetType,
  CfnListenerCertificate,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone, ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import { Bucket, BlockPublicAccess, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";

export default class YoututoraiStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const {
      stage,
      domainName,
      hostedZoneName,
      appRepoName,
      imageTag,
      googleClientId,
      sesFromEmail,
      chatModel,
      visionModel,
      // Imported from kpai's deployed CFN outputs via the release script.
      vpcId,
      clusterName,
      capacityProviderName,
      albArn,
      albDnsName,
      albCanonicalHostedZoneId,
      albHttpsListenerArn,
      albSgId,
      dbHost,
      dbPort,
      dbSecretArn,
    } = props;

    const isProd = stage === "prod";
    const appRepo = Repository.fromRepositoryName(this, "AppRepo", appRepoName);

    // === Imports from kpai stack ============================================
    //
    // CDK's Vpc.fromLookup queries AWS during synth and caches in
    // cdk.context.json — fine, but it requires the VPC to be tag-discoverable.
    // fromVpcAttributes accepts a value at synth and trusts it at deploy.
    // We pass the VPC ID through as a context value, so attributes is the
    // right tool.
    const vpc = Vpc.fromVpcAttributes(this, "Vpc", {
      vpcId,
      availabilityZones: this.availabilityZones,
    });

    const albSg = SecurityGroup.fromSecurityGroupId(this, "AlbSg", albSgId, {
      mutable: false,
    });
    // instanceSgId is intentionally not imported here — kpai already opened
    // ALB→instance ingress on the bridge-mode ephemeral range and ytai's
    // tasks share that ingress automatically by landing on the same host.

    const cluster = Cluster.fromClusterAttributes(this, "Cluster", {
      clusterName,
      vpc,
      securityGroups: [],
    });

    const alb = ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(
      this,
      "Alb",
      {
        loadBalancerArn: albArn,
        loadBalancerCanonicalHostedZoneId: albCanonicalHostedZoneId,
        loadBalancerDnsName: albDnsName,
        securityGroupId: albSgId,
        vpc,
      },
    );

    const listener = ApplicationListener.fromApplicationListenerAttributes(
      this,
      "ImportedListener",
      {
        listenerArn: albHttpsListenerArn,
        securityGroup: albSg,
      },
    );

    const dbSecret = Secret.fromSecretCompleteArn(this, "DbSecret", dbSecretArn);

    const domainZone = HostedZone.fromLookup(this, "Zone", {
      domainName: hostedZoneName,
    });

    // === ytai-owned secrets =================================================

    const jwtSecret = new Secret(this, "JwtSecret", {
      secretName: `ytai/${stage}/jwt`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    const openRouterSecret = new Secret(this, "OpenRouterKey", {
      secretName: `ytai/${stage}/openrouter`,
      description:
        "Populate after first deploy: aws secretsmanager put-secret-value --secret-id ytai/<stage>/openrouter --secret-string sk-or-...",
    });

    // Admin password for the local username+password sign-in path. Auto-
    // generated so the default `adminadmin` never lands in prod. Read out
    // after first deploy:
    //   aws secretsmanager get-secret-value --secret-id ytai/<stage>/admin-password
    const adminPasswordSecret = new Secret(this, "AdminPassword", {
      secretName: `ytai/${stage}/admin-password`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 24,
      },
    });

    // === Image bucket =======================================================

    // Shared bucket: `images/<uuid>.<ext>` (session uploads, kept forever
    // unless the owning session is deleted), `audio/<hash>.mp3` (TTS cache,
    // kept indefinitely since synthesis cost dominates storage).
    //
    // Cleanup is driven by the app: when a session/doc is deleted, the
    // delete handler PUTs a `lifecycle=orphan` tag on the S3 object. The
    // tag-filtered rule below reaps those orphans on the next daily sweep
    // (~24h). No prefix-based expiry — live session content stays until
    // the user (or admin wipe) deletes it.
    const imageBucket = new Bucket(this, "ImageBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: `expire-${stage}-orphans`,
          enabled: true,
          tagFilters: { lifecycle: "orphan" },
          expiration: Duration.days(1),
        },
      ],
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // === Logs ===============================================================

    const logGroup = new LogGroup(this, "LogGroup", {
      logGroupName: `/ytai/${stage}`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // === Task definition (merged app + OCR + TTS container) =================

    const taskDef = new Ec2TaskDefinition(this, "Task", {
      networkMode: NetworkMode.BRIDGE,
    });
    imageBucket.grantReadWrite(taskDef.taskRole);

    // SES permission for the email-OTP sign-in path. Harmless when
    // YTAI_SES_FROM_EMAIL is unset (the route logs the OTP and skips SES).
    taskDef.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );

    taskDef.addContainer("App", {
      image: ContainerImage.fromEcrRepository(appRepo, imageTag),
      // App ~300 MB + EasyOCR resident ~1.5 GB + Kokoro resident ~1 GB.
      // Soft reservation matches the hard cap so ECS schedules with the
      // real footprint in mind and CloudWatch's MemoryUtilization metric
      // (reported against the soft reservation) reads as a sensible
      // percentage of the actual envelope, not >100% all the time.
      memoryLimitMiB: 4096,
      memoryReservationMiB: 4096,
      cpu: 1024,
      logging: LogDrivers.awsLogs({ logGroup, streamPrefix: "app" }),
      environment: {
        NODE_ENV: "production",
        YTAI_API_PORT: "80",
        YTAI_PUBLIC_URL: `https://${domainName}`,
        YTAI_PG_HOST: dbHost,
        YTAI_PG_PORT: dbPort,
        YTAI_PG_DATABASE: "ytai",
        YTAI_S3_BUCKET: imageBucket.bucketName,
        // Per-stage key namespace in S3. "prod/images/…", "prod/audio/…".
        // Local-dev laptops use "dev/…" by default.
        YTAI_S3_PREFIX: stage,
        YTAI_AWS_REGION: this.region,
        YTAI_ADMIN_USERNAME: "admin",
        ...(googleClientId ? { YTAI_GOOGLE_CLIENT_ID: googleClientId } : {}),
        ...(sesFromEmail ? { YTAI_SES_FROM_EMAIL: sesFromEmail } : {}),
        ...(chatModel ? { YTAI_OPENROUTER_CHAT_MODEL: chatModel } : {}),
        ...(visionModel ? { YTAI_OPENROUTER_VISION_MODEL: visionModel } : {}),
      },
      secrets: {
        YTAI_PG_USER: EcsSecret.fromSecretsManager(dbSecret, "username"),
        YTAI_PG_PASSWORD: EcsSecret.fromSecretsManager(dbSecret, "password"),
        YTAI_JWT_SECRET: EcsSecret.fromSecretsManager(jwtSecret),
        YTAI_OPENROUTER_API_KEY: EcsSecret.fromSecretsManager(openRouterSecret),
        YTAI_ADMIN_PASSWORD: EcsSecret.fromSecretsManager(adminPasswordSecret),
      },
      // hostPort omitted → ECS assigns ephemeral host port; ALB target group
      // with TargetType.INSTANCE picks it up via dynamic mapping.
      portMappings: [{ containerPort: 80 }],
    });

    // === Target group + listener rule + cert ================================

    const targetGroup = new ApplicationTargetGroup(this, "TargetGroup", {
      vpc,
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.INSTANCE,
      healthCheck: {
        path: "/healthcheck",
        // Merged container does TTS + OCR model load before /healthcheck
        // returns 200. Wide window so cold deploys don't flap.
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
    });

    const ytaiCert = new Certificate(this, "Certificate", {
      domainName,
      validation: CertificateValidation.fromDns(domainZone),
    });
    new CfnListenerCertificate(this, "ListenerCertAttachment", {
      listenerArn: albHttpsListenerArn,
      certificates: [{ certificateArn: ytaiCert.certificateArn }],
    });

    // Host-header rule on kpai's HTTPS listener. yoututorai.* matches → ytai
    // TG. Everything else (including kidplayai.*) falls through to the
    // listener's default action, which still forwards to kpai's TG.
    new ApplicationListenerRule(this, "HostHeaderRule", {
      listener,
      priority: 100,
      conditions: [ListenerCondition.hostHeaders([domainName])],
      action: ListenerAction.forward([targetGroup]),
    });

    // === Service ============================================================

    const service = new Ec2Service(this, "EcsService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      healthCheckGracePeriod: Duration.seconds(300),
      circuitBreaker: { rollback: true },
      capacityProviderStrategies: [
        { capacityProvider: capacityProviderName, weight: 1 },
      ],
    });
    service.attachToApplicationTargetGroup(targetGroup);

    // === DNS ================================================================

    new ARecord(this, "DnsAlias", {
      zone: domainZone,
      recordName: domainName,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(alb)),
    });

    // === Outputs ============================================================

    new CfnOutput(this, "ServiceName", { value: service.serviceName });
    new CfnOutput(this, "TargetGroupArn", { value: targetGroup.targetGroupArn });
    new CfnOutput(this, "ImageBucketName", { value: imageBucket.bucketName });
    new CfnOutput(this, "JwtSecretArn", { value: jwtSecret.secretArn });
    new CfnOutput(this, "OpenRouterSecretArn", { value: openRouterSecret.secretArn });
    new CfnOutput(this, "AdminPasswordSecretArn", {
      value: adminPasswordSecret.secretArn,
    });
    new CfnOutput(this, "ImageTag", { value: imageTag });
  }
}
