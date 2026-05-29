import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { ServiceBusClient } from '@azure/service-bus';
import { createCosmosRepository } from '../data/repository.cosmos';
import type { Repository } from '../data/repository';
import type { DomainEvent } from '@clos/shared-types';

let _repo: Repository | null = null;
let _blob: BlobServiceClient | null = null;
let _serviceBus: ServiceBusClient | null = null;

export function getRepository(): Repository {
  if (!_repo) {
    _repo = createCosmosRepository();
  }
  return _repo;
}

export function getBlobServiceClient(): BlobServiceClient {
  if (!_blob) {
    const endpoint = process.env.STORAGE_BLOB_ENDPOINT;
    if (!endpoint) throw new Error('STORAGE_BLOB_ENDPOINT environment variable is required');
    _blob = new BlobServiceClient(endpoint, new DefaultAzureCredential());
  }
  return _blob;
}

function getServiceBusClient(): ServiceBusClient {
  if (!_serviceBus) {
    const ns = process.env.SERVICEBUS_FULLY_QUALIFIED_NAMESPACE;
    if (!ns) throw new Error('SERVICEBUS_FULLY_QUALIFIED_NAMESPACE environment variable is required');
    _serviceBus = new ServiceBusClient(ns, new DefaultAzureCredential());
  }
  return _serviceBus;
}

export async function publishEvent(event: DomainEvent): Promise<void> {
  const topicName = process.env.SERVICEBUS_TOPIC_NAME ?? 'clos-notifications';
  const sender = getServiceBusClient().createSender(topicName);
  try {
    await sender.sendMessages({ body: event, contentType: 'application/json' });
  } finally {
    await sender.close();
  }
}

export function _resetRepository(): void { _repo = null; }
export function _resetClients(): void { _blob = null; _serviceBus = null; }
