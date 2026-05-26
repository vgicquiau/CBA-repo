import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import type { StageConfig } from './config';
import { ssmPath } from './config';

export class NotificationsStack extends Stack {
  public readonly topic: sns.Topic;
  public readonly alarmsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: StackProps & {
    config: StageConfig;
    tableArn: string;
    tableName: string;
  }) {
    super(scope, id, props);
    const cfg = props.config;

    const tableName = props.tableName;
    const tableArn = props.tableArn;

    // ─── SNS topics ───────────────────────────────────────────────────────────

    this.topic = new sns.Topic(this, 'NotificationsTopic', {
      topicName: `clos-notifications-${cfg.stage}`,
    });

    this.alarmsTopic = new sns.Topic(this, 'AlarmsTopic', {
      topicName: `clos-alarms-${cfg.stage}`,
    });

    // Subscribe admin email to alarms topic
    const adminEmailParam = ssm.StringParameter.valueForStringParameter(
      this, `/clos/${cfg.stage}/admin-email`,
    );
    this.alarmsTopic.addSubscription(new snsSubscriptions.EmailSubscription(adminEmailParam));

    // ─── notification-dispatcher Lambda ───────────────────────────────────────

    const dispatcherRole = new iam.Role(this, 'DispatcherRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    dispatcherRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [tableArn],
    }));
    dispatcherRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ses:SendTemplatedEmail'],
      resources: ['*'],
    }));
    dispatcherRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/clos/${cfg.stage}/admin-email`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/clos/${cfg.stage}/ses-from-address`,
      ],
    }));

    const dispatcher = new lambdaNodejs.NodejsFunction(this, 'DispatcherFn', {
      entry: path.join(__dirname, '../../backend/src/handlers/notification-dispatcher.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
      role: dispatcherRole,
      logRetention: cfg.logRetention as logs.RetentionDays,
      bundling: {
        minify: true,
        target: 'es2020',
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        TABLE_NAME: tableName,
        STAGE: cfg.stage,
        LOG_LEVEL: cfg.logLevel,
        SES_FROM_ADDRESS: ssm.StringParameter.valueForStringParameter(
          this, `/clos/${cfg.stage}/ses-from-address`,
        ),
        ADMIN_EMAIL_PARAM_NAME: `/clos/${cfg.stage}/admin-email`,
      },
    });

    // Subscribe dispatcher to notifications topic
    this.topic.addSubscription(new snsSubscriptions.LambdaSubscription(dispatcher));

    // ─── reconciliation-job Lambda ────────────────────────────────────────────

    const reconciliationRole = new iam.Role(this, 'ReconciliationRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    reconciliationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:Query'],
      resources: [`${tableArn}/index/gsi2`],
    }));
    reconciliationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: [this.topic.topicArn],
    }));

    const reconciliationJob = new lambdaNodejs.NodejsFunction(this, 'ReconciliationJobFn', {
      entry: path.join(__dirname, '../../backend/src/handlers/reconciliation-job.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(60),
      role: reconciliationRole,
      logRetention: cfg.logRetention as logs.RetentionDays,
      bundling: {
        minify: true,
        target: 'es2020',
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        TABLE_NAME: tableName,
        STAGE: cfg.stage,
        SNS_TOPIC_ARN: this.topic.topicArn,
        LOG_LEVEL: cfg.logLevel,
      },
    });

    // EventBridge rule: 0 1 * * ? * (01:00 UTC = ~03:00 Paris)
    new events.Rule(this, 'ReconciliationSchedule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '1' }),
      targets: [new eventsTargets.LambdaFunction(reconciliationJob)],
    });

    // ─── CloudWatch Alarms ────────────────────────────────────────────────────

    const alarmAction = new cloudwatchActions.SnsAction(this.alarmsTopic);

    // Lambda error alarms (dispatcher + reconciliation)
    for (const [name, fn] of [['Dispatcher', dispatcher], ['Reconciliation', reconciliationJob]] as const) {
      const errorsAlarm = new cloudwatch.Alarm(this, `${name}ErrorsAlarm`, {
        metric: fn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `${name} Lambda errors > 5 in 5 min`,
      });
      errorsAlarm.addAlarmAction(alarmAction);
    }

    // DynamoDB errors
    const ddbUserErrors = new cloudwatch.Alarm(this, 'DdbUserErrors', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'UserErrors',
        dimensionsMap: { TableName: tableName },
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 10,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ddbUserErrors.addAlarmAction(alarmAction);

    const ddbSystemErrors = new cloudwatch.Alarm(this, 'DdbSystemErrors', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'SystemErrors',
        dimensionsMap: { TableName: tableName },
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ddbSystemErrors.addAlarmAction(alarmAction);

    // Reconciliation conflicts detected alarm
    const conflictsAlarm = new cloudwatch.Alarm(this, 'ReconciliationConflictsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: `ClosBonAccueil/${cfg.stage}`,
        metricName: 'ReconciliationConflictsDetected',
        period: Duration.days(1),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    conflictsAlarm.addAlarmAction(alarmAction);

    // ─── SSM output ───────────────────────────────────────────────────────────

    new ssm.StringParameter(this, 'TopicArnParam', {
      parameterName: ssmPath(cfg, 'notifications', 'topic-arn'),
      stringValue: this.topic.topicArn,
    });
  }
}
