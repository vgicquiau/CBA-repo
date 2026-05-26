import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import type { StageConfig } from './config';
import { ssmPath } from './config';

// ─── Handler IAM configuration ────────────────────────────────────────────────

interface HandlerConfig {
  id: string;
  file: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  // API path (with {param} placeholders)
  path: string[];
  memoryMb: number;
  timeoutSec: number;
  // DynamoDB: list of action groups needed
  ddb: {
    actions: string[];
    // 'table' = main table, 'gsiN' = table/index/gsiN
    resources: Array<'table' | 'gsi1' | 'gsi2' | 'gsi3'>;
  };
  snsPublish?: boolean;
  s3PutObject?: boolean;    // for pre-signed URL generation (PutObject on photo bucket)
  cognito?: string[];       // Cognito action list (AdminCreateUser, AdminDeleteUser, etc.)
}

const HANDLERS: HandlerConfig[] = [
  // Public routes
  {
    id: 'Health', file: 'health', method: 'GET', path: ['health'],
    memoryMb: 128, timeoutSec: 3,
    ddb: { actions: [], resources: [] },
  },
  // Me routes
  {
    id: 'MeGet', file: 'me-get', method: 'GET', path: ['me'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:GetItem'], resources: ['table'] },
  },
  {
    id: 'MeDelete', file: 'me-delete', method: 'DELETE', path: ['me'],
    memoryMb: 512, timeoutSec: 30,
    ddb: { actions: ['dynamodb:Query', 'dynamodb:DeleteItem', 'dynamodb:UpdateItem'], resources: ['table', 'gsi1'] },
    snsPublish: true,
    cognito: ['cognito-idp:AdminDeleteUser'],
  },
  {
    id: 'MeExport', file: 'me-export', method: 'GET', path: ['me', 'export'],
    memoryMb: 512, timeoutSec: 10,
    ddb: { actions: ['dynamodb:GetItem', 'dynamodb:Query'], resources: ['table', 'gsi1'] },
  },
  // House
  {
    id: 'HouseGet', file: 'house-get', method: 'GET', path: ['house'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:GetItem', 'dynamodb:Query'], resources: ['table', 'gsi1'] },
  },
  // Rooms
  {
    id: 'RoomsList', file: 'rooms-list', method: 'GET', path: ['rooms'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query'], resources: ['gsi1'] },
  },
  {
    id: 'RoomsGet', file: 'rooms-get', method: 'GET', path: ['rooms', '{roomId}'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:GetItem'], resources: ['table'] },
  },
  {
    id: 'RoomBookingsList', file: 'room-bookings-list', method: 'GET', path: ['rooms', '{roomId}', 'bookings'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query'], resources: ['table'] },
  },
  {
    id: 'RoomAvailability', file: 'room-availability', method: 'GET', path: ['rooms', '{roomId}', 'availability'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query', 'dynamodb:GetItem'], resources: ['table'] },
  },
  // Bookings (guest)
  {
    id: 'BookingsListMine', file: 'bookings-list-mine', method: 'GET', path: ['bookings', 'me'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query'], resources: ['gsi1'] },
  },
  {
    id: 'BookingsGet', file: 'bookings-get', method: 'GET', path: ['bookings', '{bookingId}'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query'], resources: ['gsi3'] },
  },
  {
    id: 'BookingsCreate', file: 'bookings-create', method: 'POST', path: ['bookings'],
    memoryMb: 512, timeoutSec: 10,
    ddb: { actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:TransactWriteItems', 'dynamodb:PutItem'], resources: ['table', 'gsi2'] },
    snsPublish: true,
  },
  {
    id: 'BookingsUpdate', file: 'bookings-update', method: 'PATCH', path: ['bookings', '{bookingId}'],
    memoryMb: 512, timeoutSec: 10,
    ddb: { actions: ['dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:TransactWriteItems', 'dynamodb:UpdateItem'], resources: ['table', 'gsi2', 'gsi3'] },
    snsPublish: true,
  },
  {
    id: 'BookingsDelete', file: 'bookings-delete', method: 'DELETE', path: ['bookings', '{bookingId}'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query', 'dynamodb:DeleteItem'], resources: ['table', 'gsi3'] },
    snsPublish: true,
  },
  // Admin — dashboard + bookings
  {
    id: 'AdminDashboard', file: 'admin-dashboard', method: 'GET', path: ['admin', 'dashboard'],
    memoryMb: 512, timeoutSec: 10,
    ddb: { actions: ['dynamodb:Query'], resources: ['gsi1', 'gsi2'] },
  },
  {
    id: 'AdminBookingsList', file: 'admin-bookings-list', method: 'GET', path: ['admin', 'bookings'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query'], resources: ['gsi2'] },
  },
  {
    id: 'AdminBookingsGet', file: 'admin-bookings-get', method: 'GET', path: ['admin', 'bookings', '{bookingId}'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query'], resources: ['gsi3'] },
  },
  {
    id: 'AdminBookingsCreate', file: 'admin-bookings-create', method: 'POST', path: ['admin', 'bookings'],
    memoryMb: 512, timeoutSec: 10,
    ddb: { actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:TransactWriteItems', 'dynamodb:PutItem'], resources: ['table', 'gsi2'] },
    snsPublish: true,
  },
  {
    id: 'AdminBookingsUpdate', file: 'admin-bookings-update', method: 'PATCH', path: ['admin', 'bookings', '{bookingId}'],
    memoryMb: 512, timeoutSec: 10,
    ddb: { actions: ['dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:TransactWriteItems', 'dynamodb:UpdateItem'], resources: ['table', 'gsi2', 'gsi3'] },
    snsPublish: true,
  },
  {
    id: 'AdminBookingsDelete', file: 'admin-bookings-delete', method: 'DELETE', path: ['admin', 'bookings', '{bookingId}'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query', 'dynamodb:DeleteItem'], resources: ['table', 'gsi3'] },
    snsPublish: true,
  },
  // Admin — rooms
  {
    id: 'AdminRoomsCreate', file: 'admin-rooms-create', method: 'POST', path: ['admin', 'rooms'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:PutItem'], resources: ['table', 'gsi1'] },
  },
  {
    id: 'AdminRoomsUpdate', file: 'admin-rooms-update', method: 'PATCH', path: ['admin', 'rooms', '{roomId}'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:UpdateItem'], resources: ['table'] },
  },
  {
    id: 'AdminRoomsDelete', file: 'admin-rooms-delete', method: 'DELETE', path: ['admin', 'rooms', '{roomId}'],
    memoryMb: 1024, timeoutSec: 30,
    ddb: { actions: ['dynamodb:Query', 'dynamodb:TransactWriteItems'], resources: ['table', 'gsi1'] },
    snsPublish: true,
  },
  {
    id: 'AdminRoomsPhotoUrl', file: 'admin-rooms-photo-url', method: 'POST', path: ['admin', 'rooms', '{roomId}', 'photo-upload-url'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:GetItem'], resources: ['table'] },
    s3PutObject: true,
  },
  // Admin — users
  {
    id: 'AdminUsersList', file: 'admin-users-list', method: 'GET', path: ['admin', 'users'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:Query'], resources: ['gsi1'] },
  },
  {
    id: 'AdminUsersInvite', file: 'admin-users-invite', method: 'POST', path: ['admin', 'users', 'invite'],
    memoryMb: 512, timeoutSec: 10,
    ddb: { actions: ['dynamodb:PutItem'], resources: ['table'] },
    cognito: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminAddUserToGroup'],
    snsPublish: true,
  },
  {
    id: 'AdminUsersDelete', file: 'admin-users-delete', method: 'DELETE', path: ['admin', 'users', '{userId}'],
    memoryMb: 512, timeoutSec: 30,
    ddb: { actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:DeleteItem', 'dynamodb:UpdateItem'], resources: ['table', 'gsi1'] },
    cognito: ['cognito-idp:AdminDeleteUser'],
    snsPublish: true,
  },
  // Admin — house
  {
    id: 'AdminHouseGet', file: 'admin-house-get', method: 'GET', path: ['admin', 'house'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:GetItem'], resources: ['table'] },
  },
  {
    id: 'AdminHouseUpdate', file: 'admin-house-update', method: 'PATCH', path: ['admin', 'house'],
    memoryMb: 256, timeoutSec: 5,
    ddb: { actions: ['dynamodb:UpdateItem'], resources: ['table'] },
  },
];

// ─── Stack ────────────────────────────────────────────────────────────────────

export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    config: StageConfig;
    tableArn: string;
    tableName: string;
    photoBucketName: string;
    photoBucketArn: string;
    snsTopicArn: string;
    userPool: cognito.UserPool;
    alarmsTopic: sns.Topic;
  }) {
    super(scope, id, props);
    const cfg = props.config;
    const { tableArn, tableName, photoBucketName, snsTopicArn, userPool } = props;

    // ─── API Gateway custom domain cert (eu-west-3, regional) ────────────────

    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: 'clos-bon-accueil.fr',
    });

    const apiCert = new acm.Certificate(this, 'ApiCert', {
      domainName: cfg.apiDomain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ─── Access log group ─────────────────────────────────────────────────────

    const accessLogs = new logs.LogGroup(this, 'ApiAccessLogs', {
      retention: cfg.logRetention,
      removalPolicy: cfg.removalPolicy,
    });

    // ─── REST API ─────────────────────────────────────────────────────────────

    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: `clos-bon-accueil-${cfg.stage}`,
      description: 'Le Clos Bon Accueil REST API',
      deployOptions: {
        stageName: 'v1',
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogs),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        tracingEnabled: cfg.xrayEnabled,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: cfg.allowedOrigins,
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
        maxAge: Duration.seconds(600),
      },
      domainName: {
        domainName: cfg.apiDomain,
        certificate: apiCert,
        endpointType: apigateway.EndpointType.REGIONAL,
      },
    });

    // Route 53 alias for API
    new route53.ARecord(this, 'ApiARecord', {
      zone: hostedZone,
      recordName: cfg.apiDomain,
      target: route53.RecordTarget.fromAlias(new route53targets.ApiGatewayDomain(api.domainName!)),
    });

    // Cognito authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });

    const authOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Common Lambda environment variables
    const commonEnv = (h: HandlerConfig) => ({
      TABLE_NAME: tableName,
      STAGE: cfg.stage,
      LOG_LEVEL: cfg.logLevel,
      SNS_TOPIC_ARN: snsTopicArn,
      PHOTO_BUCKET: photoBucketName,
      PHOTO_CDN_DOMAIN: ssm.StringParameter.valueForStringParameter(this, ssmPath(cfg, 'data', 'photo-cdn-domain')),
      USER_POOL_ID: userPool.userPoolId,
    });

    const commonBundling: lambdaNodejs.BundlingOptions = {
      minify: true,
      target: 'es2020',
      externalModules: ['@aws-sdk/*'],
      sourceMap: !cfg.xrayEnabled, // sourcemaps in dev only
    };

    // Build DynamoDB IAM resource ARNs for a handler
    const ddbResources = (resources: HandlerConfig['ddb']['resources']) => {
      const result: string[] = [];
      if (resources.includes('table')) result.push(tableArn);
      if (resources.includes('gsi1')) result.push(`${tableArn}/index/gsi1`);
      if (resources.includes('gsi2')) result.push(`${tableArn}/index/gsi2`);
      if (resources.includes('gsi3')) result.push(`${tableArn}/index/gsi3`);
      return result;
    };

    // Create Lambda + IAM role for each handler
    const lambdaFunctions: Record<string, lambda.Function> = {};

    for (const h of HANDLERS) {
      const role = new iam.Role(this, `${h.id}Role`, {
        roleName: `ClosBonAccueil-${h.id}-${cfg.stage}`,
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      });

      // DynamoDB permissions
      if (h.ddb.actions.length > 0 && h.ddb.resources.length > 0) {
        role.addToPolicy(new iam.PolicyStatement({
          actions: h.ddb.actions,
          resources: ddbResources(h.ddb.resources),
        }));
      }

      // SNS
      if (h.snsPublish) {
        role.addToPolicy(new iam.PolicyStatement({
          actions: ['sns:Publish'],
          resources: [snsTopicArn],
        }));
      }

      // S3 (pre-signed URL generation)
      if (h.s3PutObject) {
        role.addToPolicy(new iam.PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [`${props.photoBucketArn}/*`],
        }));
      }

      // Cognito
      if (h.cognito && h.cognito.length > 0) {
        role.addToPolicy(new iam.PolicyStatement({
          actions: h.cognito,
          resources: [userPool.userPoolArn],
        }));
      }

      // X-Ray (prod only)
      if (cfg.xrayEnabled) {
        role.addManagedPolicy(
          iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
        );
      }

      const fn = new lambdaNodejs.NodejsFunction(this, `${h.id}Fn`, {
        functionName: `ClosBonAccueil-${h.file}-${cfg.stage}`,
        entry: path.join(__dirname, `../../backend/src/handlers/${h.file}.ts`),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: h.memoryMb,
        timeout: Duration.seconds(h.timeoutSec),
        role,
        logRetention: cfg.logRetention as logs.RetentionDays,
        tracing: cfg.xrayEnabled ? lambda.Tracing.ACTIVE : lambda.Tracing.DISABLED,
        bundling: commonBundling,
        environment: commonEnv(h),
      });

      lambdaFunctions[h.id] = fn;

      // CloudWatch alarm for Lambda errors (prod only)
      if (cfg.xrayEnabled) {
        const errAlarm = new cloudwatch.Alarm(this, `${h.id}ErrorsAlarm`, {
          metric: fn.metricErrors({ period: Duration.minutes(5) }),
          threshold: 5,
          evaluationPeriods: 1,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        errAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmsTopic));
      }
    }

    // ─── Wire routes ──────────────────────────────────────────────────────────

    // Helper: navigate/create resource nodes
    const resource = (pathSegments: string[]) => {
      let res = api.root;
      for (const seg of pathSegments) {
        const existing = res.getResource(seg);
        res = existing ?? res.addResource(seg);
      }
      return res;
    };

    const integrate = (h: HandlerConfig, useAuth: boolean) => {
      const res = resource(h.path);
      const integration = new apigateway.LambdaIntegration(lambdaFunctions[h.id]);
      res.addMethod(h.method, integration, useAuth ? authOptions : {});
    };

    // Health — no auth
    integrate(HANDLERS.find(h => h.id === 'Health')!, false);

    // All other routes — Cognito auth
    for (const h of HANDLERS.filter(h => h.id !== 'Health')) {
      integrate(h, true);
    }

    // ─── WAF v2 ────────────────────────────────────────────────────────────────

    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `ClosBonAccueil-${cfg.stage}`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `ClosBonAccueil-${cfg.stage}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitPerIp',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitPerIp',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // Associate WAF with the API Gateway stage
    new wafv2.CfnWebACLAssociation(this, 'WebAclAssoc', {
      resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${api.restApiId}/stages/v1`,
      webAclArn: webAcl.attrArn,
    });

    // API Gateway 5XX alarm (> 5 errors in 10 min)
    const apiFivexxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      metric: api.metricServerError({ period: Duration.minutes(10) }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiFivexxAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmsTopic));

    // ─── SSM output ───────────────────────────────────────────────────────────

    new ssm.StringParameter(this, 'ApiUrlParam', {
      parameterName: ssmPath(cfg, 'api', 'url'),
      stringValue: api.url,
    });
  }
}
