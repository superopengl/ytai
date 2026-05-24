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

export default class YoututoraiStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const {
      stage,
      domainName,
      hostedZoneName,
      appRepoName,
      imageTag,
      imageRetentionDays,
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

    // === Image bucket =======================================================

    const imageBucket = new Bucket(this, "ImageBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        { enabled: true, expiration: Duration.days(imageRetentionDays) },
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

    taskDef.addContainer("App", {
      image: ContainerImage.fromEcrRepository(appRepo, imageTag),
      // App ~300 MB + EasyOCR resident ~1.5 GB + Kokoro resident ~1 GB.
      // 4 GiB hard cap, 2 GiB soft reservation leaves the rest of the
      // t3.large's 8 GiB for kpai's task.
      memoryLimitMiB: 4096,
      memoryReservationMiB: 2048,
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
        YTAI_AWS_REGION: this.region,
        YTAI_IMAGE_RETENTION_DAYS: String(imageRetentionDays),
      },
      secrets: {
        YTAI_PG_USER: EcsSecret.fromSecretsManager(dbSecret, "username"),
        YTAI_PG_PASSWORD: EcsSecret.fromSecretsManager(dbSecret, "password"),
        YTAI_JWT_SECRET: EcsSecret.fromSecretsManager(jwtSecret),
        YTAI_OPENROUTER_API_KEY: EcsSecret.fromSecretsManager(openRouterSecret),
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
    new CfnOutput(this, "ImageTag", { value: imageTag });
  }
}
