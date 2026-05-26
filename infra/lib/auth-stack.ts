import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import type { StageConfig } from './config';
import { ssmPath } from './config';

export class AuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly webClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: StackProps & {
    config: StageConfig;
    tableArn: string;
    tableName: string;
  }) {
    super(scope, id, props);
    const cfg = props.config;

    // ─── Post-confirmation Lambda ─────────────────────────────────────────────

    const postConfirmRole = new iam.Role(this, 'PostConfirmRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    postConfirmRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [props.tableArn],
    }));

    const postConfirmFn = new lambdaNodejs.NodejsFunction(this, 'PostConfirmFn', {
      entry: path.join(__dirname, '../../backend/src/handlers/auth-post-confirmation.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      role: postConfirmRole,
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        minify: true,
        target: 'es2020',
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        TABLE_NAME: props.tableName,
        STAGE: cfg.stage,
        LOG_LEVEL: cfg.logLevel,
      },
    });

    // ─── Cognito User Pool ────────────────────────────────────────────────────

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `clos-bon-accueil-${cfg.stage}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: cognito.Mfa.OFF,
      passwordPolicy: {
        minLength: 10,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cfg.removalPolicy,
      lambdaTriggers: {
        postConfirmation: postConfirmFn,
      },
    });

    // Groups
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
      precedence: 1,
    });
    new cognito.CfnUserPoolGroup(this, 'GuestGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'guest',
      precedence: 10,
    });

    // App client — no secret, USER_PASSWORD_AUTH + REFRESH_TOKEN
    this.webClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'web-client',
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: false,
        custom: false,
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // ─── SSM outputs ──────────────────────────────────────────────────────────

    new ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: ssmPath(cfg, 'auth', 'user-pool-id'),
      stringValue: this.userPool.userPoolId,
    });
    new ssm.StringParameter(this, 'UserPoolArnParam', {
      parameterName: ssmPath(cfg, 'auth', 'user-pool-arn'),
      stringValue: this.userPool.userPoolArn,
    });
    new ssm.StringParameter(this, 'WebClientIdParam', {
      parameterName: ssmPath(cfg, 'auth', 'web-client-id'),
      stringValue: this.webClient.userPoolClientId,
    });
  }
}
