import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { withErrorHandling, requireRole, getPathParam, ok } from '../api/http';
import { getRepository, getBlobServiceClient } from '../api/deps';
import { NotFoundError } from '../data/repository';

const PHOTOS_CONTAINER = process.env.PHOTOS_CONTAINER ?? 'photos';
const CDN_DOMAIN = process.env.CDN_DOMAIN ?? '';
const EXPIRES_IN = 300; // 5 minutes

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const roomId = getPathParam(request, 'roomId');
  const repo = getRepository();
  const room = await repo.getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);

  const key = `rooms/${roomId}/photo-${Date.now()}.jpg`;
  const blobServiceClient = getBlobServiceClient();
  const accountName = new URL(blobServiceClient.url).hostname.split('.')[0];

  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + EXPIRES_IN * 1000);
  const delegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: PHOTOS_CONTAINER,
      blobName: key,
      permissions: BlobSASPermissions.from({ write: true }),
      startsOn,
      expiresOn,
      contentType: 'image/jpeg',
    },
    delegationKey,
    accountName,
  ).toString();

  const baseUrl = blobServiceClient.url.endsWith('/') ? blobServiceClient.url : `${blobServiceClient.url}/`;
  const uploadUrl = `${baseUrl}${PHOTOS_CONTAINER}/${key}?${sasToken}`;
  const publicUrl = `https://${CDN_DOMAIN}/${key}`;
  return ok({ uploadUrl, publicUrl, expiresIn: EXPIRES_IN });
}

app.http('admin-rooms-photo-url', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/rooms/{roomId}/photo-upload-url',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
