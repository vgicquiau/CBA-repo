import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import type { StageConfig } from './config';
import { ssmPath } from './config';

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    config: StageConfig;
  }) {
    super(scope, id, props);
    const cfg = props.config;

    // ─── S3 website bucket ────────────────────────────────────────────────────

    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `clos-web-${cfg.stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cfg.removalPolicy,
      autoDeleteObjects: cfg.removalPolicy === RemovalPolicy.DESTROY,
    });

    // ─── CloudFront distribution ──────────────────────────────────────────────

    const cfCertArn = ssm.StringParameter.valueFromLookup(this, '/clos/certs/cloudfront-cert-arn');

    const domainNames = cfg.stage === 'prod'
      ? [cfg.domain, 'clos-bon-accueil.fr']
      : [cfg.domain];

    const webOai = new cloudfront.OriginAccessIdentity(this, 'WebBucketOAI');
    webBucket.grantRead(webOai);

    const distribution = new cloudfront.Distribution(this, 'WebCdn', {
      defaultBehavior: {
        origin: new origins.S3Origin(webBucket, { originAccessIdentity: webOai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // SPA: no-cache for HTML
        compress: true,
      },
      domainNames,
      certificate: acm.Certificate.fromCertificateArn(this, 'CfCert', cfCertArn),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // SPA fallback: 403/404 → /index.html
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    // ─── Route 53 aliases ─────────────────────────────────────────────────────

    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: 'clos-bon-accueil.fr',
    });

    new route53.ARecord(this, 'WebARecord', {
      zone: hostedZone,
      recordName: cfg.domain,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution)),
    });
    new route53.AaaaRecord(this, 'WebAaaaRecord', {
      zone: hostedZone,
      recordName: cfg.domain,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution)),
    });

    // ─── BucketDeployment — Vite build assets ─────────────────────────────────

    new s3deploy.BucketDeployment(this, 'DeployWeb', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist')),
      ],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 256,
    });

    // ─── BucketDeployment — config.json (generated at deploy time) ───────────

    const userPoolId = ssm.StringParameter.valueForStringParameter(
      this, ssmPath(cfg, 'auth', 'user-pool-id'),
    );
    const userPoolClientId = ssm.StringParameter.valueForStringParameter(
      this, ssmPath(cfg, 'auth', 'web-client-id'),
    );
    const apiBaseUrl = ssm.StringParameter.valueForStringParameter(
      this, ssmPath(cfg, 'api', 'url'),
    );
    const cdnDomain = ssm.StringParameter.valueForStringParameter(
      this, ssmPath(cfg, 'data', 'photo-cdn-domain'),
    );

    const configJson = JSON.stringify({
      apiBaseUrl,
      userPoolId,
      userPoolClientId,
      region: 'eu-west-3',
      cdnDomain,
      stage: cfg.stage,
    });

    new s3deploy.BucketDeployment(this, 'DeployConfig', {
      sources: [
        s3deploy.Source.data('config.json', configJson),
      ],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/config.json'],
      memoryLimit: 128,
      prune: false, // don't delete other files
    });
  }
}
