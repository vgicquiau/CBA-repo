import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';

// CertsStack must be deployed in us-east-1 (required by CloudFront).
// It creates the shared wildcard CloudFront certificate and writes its ARN
// to SSM in eu-west-3 so that DataStack and FrontendStack can consume it.
// Stack name: ClosBonAccueil-Certs (not stage-specific — covers both dev + prod).
export class CertsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props); // env must be { region: 'us-east-1' }

    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: 'clos-bon-accueil.fr',
    });

    // Single wildcard cert covering dev + prod CloudFront distributions
    const cfCert = new acm.Certificate(this, 'CloudFrontCert', {
      domainName: 'clos-bon-accueil.fr',
      subjectAlternativeNames: [
        '*.clos-bon-accueil.fr',
        '*.dev.clos-bon-accueil.fr',
      ],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Write CloudFront cert ARN to eu-west-3 SSM (cross-region write)
    new cr.AwsCustomResource(this, 'WriteCfCertArn', {
      onCreate: {
        service: 'SSM',
        action: 'putParameter',
        region: 'eu-west-3',
        parameters: {
          Name: '/clos/certs/cloudfront-cert-arn',
          Value: cfCert.certificateArn,
          Type: 'String',
          Overwrite: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of('/clos/certs/cloudfront-cert-arn'),
      },
      onUpdate: {
        service: 'SSM',
        action: 'putParameter',
        region: 'eu-west-3',
        parameters: {
          Name: '/clos/certs/cloudfront-cert-arn',
          Value: cfCert.certificateArn,
          Type: 'String',
          Overwrite: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of('/clos/certs/cloudfront-cert-arn'),
      },
      onDelete: {
        service: 'SSM',
        action: 'deleteParameter',
        region: 'eu-west-3',
        parameters: { Name: '/clos/certs/cloudfront-cert-arn' },
        ignoreErrorCodesMatching: 'ParameterNotFound',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
          resources: [
            `arn:aws:ssm:eu-west-3:${this.account}:parameter/clos/certs/*`,
          ],
        }),
      ]),
      installLatestAwsSdk: false,
    });
  }
}
