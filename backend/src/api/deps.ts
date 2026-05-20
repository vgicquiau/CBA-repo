import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createRepository, Repository } from '../data/repository';

let _repo: Repository | null = null;

export function getRepository(): Repository {
  if (!_repo) {
    const tableName = process.env.TABLE_NAME;
    if (!tableName) throw new Error('TABLE_NAME environment variable is required');
    const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'eu-west-3' });
    const ddb = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: { removeUndefinedValues: true },
    });
    _repo = createRepository(ddb, tableName);
  }
  return _repo;
}

// Exposé pour les tests uniquement — permet d'injecter un repo mocké
export function _resetRepository(): void {
  _repo = null;
}
