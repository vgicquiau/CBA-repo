import { App, Environment } from 'aws-cdk-lib';
import { CertsStack } from '../lib/certs-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { NotificationsStack } from '../lib/notifications-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { getStageConfig, stackName } from '../lib/config';

const app = new App();

// Stage is passed via: cdk deploy -c stage=dev (default: dev)
const stageName = app.node.tryGetContext('stage') ?? 'dev';
const cfg = getStageConfig(stageName);

const env: Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'eu-west-3',
};

// ─── CertsStack (us-east-1) — CloudFront wildcard certificate ────────────────
// Not stage-specific: covers both *.clos-bon-accueil.fr and *.dev.clos-bon-accueil.fr
new CertsStack(app, 'ClosBonAccueil-Certs', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
});

// ─── DataStack — DynamoDB + S3 + CloudFront CDN ───────────────────────────────
const dataStack = new DataStack(app, stackName('Data', cfg), {
  env,
  config: cfg,
});

// ─── AuthStack — Cognito + post-confirmation Lambda ───────────────────────────
const authStack = new AuthStack(app, stackName('Auth', cfg), {
  env,
  config: cfg,
  tableArn: dataStack.table.tableArn,
  tableName: dataStack.table.tableName,
});
authStack.addDependency(dataStack);

// ─── NotificationsStack — SNS + SES + Lambda jobs + CloudWatch alarms ─────────
const notificationsStack = new NotificationsStack(app, stackName('Notifications', cfg), {
  env,
  config: cfg,
  tableArn: dataStack.table.tableArn,
  tableName: dataStack.table.tableName,
});
notificationsStack.addDependency(dataStack);

// ─── ApiStack — REST API + 29 Lambdas + WAF ───────────────────────────────────
const apiStack = new ApiStack(app, stackName('Api', cfg), {
  env,
  config: cfg,
  tableArn: dataStack.table.tableArn,
  tableName: dataStack.table.tableName,
  photoBucketName: dataStack.photoBucket.bucketName,
  photoBucketArn: dataStack.photoBucket.bucketArn,
  snsTopicArn: notificationsStack.topic.topicArn,
  userPool: authStack.userPool,
  alarmsTopic: notificationsStack.alarmsTopic,
});
apiStack.addDependency(dataStack);
apiStack.addDependency(authStack);
apiStack.addDependency(notificationsStack);

// ─── FrontendStack — S3 + CloudFront + config.json ────────────────────────────
const frontendStack = new FrontendStack(app, stackName('Frontend', cfg), {
  env,
  config: cfg,
});
frontendStack.addDependency(apiStack);
frontendStack.addDependency(authStack);
frontendStack.addDependency(dataStack);

app.synth();
