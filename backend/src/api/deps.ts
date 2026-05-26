import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client } from '@aws-sdk/client-s3';
import { SESClient } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SSMClient } from '@aws-sdk/client-ssm';
import { createRepository, Repository } from '../data/repository';
import type { DomainEvent } from '@clos/shared-types';

const REGION = process.env.AWS_REGION ?? 'eu-west-3';

let _repo: Repository | null = null;
let _cognito: CognitoIdentityProviderClient | null = null;
let _s3: S3Client | null = null;
let _ses: SESClient | null = null;
let _sns: SNSClient | null = null;
let _ssm: SSMClient | null = null;

export function getRepository(): Repository {
  if (!_repo) {
    const tableName = process.env.TABLE_NAME;
    if (!tableName) throw new Error('TABLE_NAME environment variable is required');
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
      marshallOptions: { removeUndefinedValues: true },
    });
    _repo = createRepository(ddb, tableName);
  }
  return _repo;
}

export function getCognitoClient(): CognitoIdentityProviderClient {
  if (!_cognito) {
    _cognito = new CognitoIdentityProviderClient({ region: REGION });
  }
  return _cognito;
}

export function getS3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: REGION });
  }
  return _s3;
}

export function getSesClient(): SESClient {
  if (!_ses) {
    _ses = new SESClient({ region: REGION });
  }
  return _ses;
}

export function getSnsClient(): SNSClient {
  if (!_sns) {
    _sns = new SNSClient({ region: REGION });
  }
  return _sns;
}

export function getSsmClient(): SSMClient {
  if (!_ssm) {
    _ssm = new SSMClient({ region: REGION });
  }
  return _ssm;
}

export async function publishEvent(event: DomainEvent): Promise<void> {
  const topicArn = process.env.SNS_TOPIC_ARN;
  if (!topicArn) return; // graceful no-op if SNS not configured
  const sns = getSnsClient();
  await sns.send(new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify(event),
    MessageAttributes: {
      eventType: { DataType: 'String', StringValue: event.type },
    },
  }));
}

// Pour les tests uniquement — permet d'injecter des mocks
export function _resetRepository(): void { _repo = null; }
export function _resetClients(): void {
  _cognito = null; _s3 = null; _ses = null; _sns = null; _ssm = null;
}
