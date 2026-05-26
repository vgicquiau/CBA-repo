import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { StageConfig } from './config';
import { ssmPath } from './config';

export class DataStack extends Stack {
  public readonly table: dynamodb.Table;
  public readonly photoBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StackProps & { config: StageConfig }) {
    super(scope, id, props);
    const cfg = props.config;

    // ─── DynamoDB single table ────────────────────────────────────────────────

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: `clos-bon-accueil-${cfg.stage}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: cfg.pointInTimeRecovery,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cfg.removalPolicy,
    });

    // GSI1 — listRooms, listMyBookings, listUsers
    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2 — listAllBookings, listUpcomingBookings, reconciliation-job
    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi2',
      partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3 — findBookingById
    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi3',
      partitionKey: { name: 'gsi3pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi3sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ─── S3 photos bucket ─────────────────────────────────────────────────────

    this.photoBucket = new s3.Bucket(this, 'PhotoBucket', {
      bucketName: `clos-photos-${cfg.stage}-${this.account}`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cfg.removalPolicy,
      autoDeleteObjects: cfg.removalPolicy === RemovalPolicy.DESTROY,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: cfg.allowedOrigins,
          allowedHeaders: ['Content-Type'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'transition-to-ia',
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(90) },
          ],
        },
      ],
    });

    // ─── CloudFront distribution for photos ───────────────────────────────────

    const cfCertArn = ssm.StringParameter.valueFromLookup(this, '/clos/certs/cloudfront-cert-arn');

    const photoOai = new cloudfront.OriginAccessIdentity(this, 'PhotoBucketOAI');
    this.photoBucket.grantRead(photoOai);

    const photoCdn = new cloudfront.Distribution(this, 'PhotoCdn', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.photoBucket, { originAccessIdentity: photoOai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      domainNames: [cfg.cdnDomain],
      certificate: acm.Certificate.fromCertificateArn(this, 'CfCert', cfCertArn),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // Route 53 alias for CDN
    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: 'clos-bon-accueil.fr',
    });

    new route53.ARecord(this, 'CdnARecord', {
      zone: hostedZone,
      recordName: cfg.cdnDomain,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(photoCdn)),
    });
    new route53.AaaaRecord(this, 'CdnAaaaRecord', {
      zone: hostedZone,
      recordName: cfg.cdnDomain,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(photoCdn)),
    });

    // ─── SSM outputs ──────────────────────────────────────────────────────────

    new ssm.StringParameter(this, 'TableNameParam', {
      parameterName: ssmPath(cfg, 'data', 'table-name'),
      stringValue: this.table.tableName,
    });
    new ssm.StringParameter(this, 'TableArnParam', {
      parameterName: ssmPath(cfg, 'data', 'table-arn'),
      stringValue: this.table.tableArn,
    });
    new ssm.StringParameter(this, 'PhotoBucketNameParam', {
      parameterName: ssmPath(cfg, 'data', 'photo-bucket-name'),
      stringValue: this.photoBucket.bucketName,
    });
    new ssm.StringParameter(this, 'PhotoCdnDomainParam', {
      parameterName: ssmPath(cfg, 'data', 'photo-cdn-domain'),
      stringValue: photoCdn.distributionDomainName,
    });
  }
}
