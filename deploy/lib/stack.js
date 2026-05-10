import { Stack } from 'aws-cdk-lib';

export default class YoututoraiStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    // Resources (VPC, ALB, ECS Fargate, Aurora Postgres, S3, ECR, Route53)
    // are added as the deploy story is built out.
  }
}
