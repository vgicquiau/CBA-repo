import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withErrorHandling, requireRole, getPathParam, ok } from '../api/http';
import { getRepository, getS3Client } from '../api/deps';
import { NotFoundError } from '../data/repository';

const BUCKET = process.env.PHOTOS_BUCKET ?? '';
const CDN_DOMAIN = process.env.CDN_DOMAIN ?? '';
const EXPIRES_IN = 300; // 5 minutes

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const roomId = getPathParam(event, 'roomId');
  const repo = getRepository();
  const room = await repo.getRoom(roomId);
  if (!room) throw new NotFoundError('Room', roomId);
  const key = `rooms/${roomId}/photo-${Date.now()}.jpg`;
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: 'image/jpeg',
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: EXPIRES_IN });
  const publicUrl = `https://${CDN_DOMAIN}/${key}`;
  return ok({ uploadUrl, publicUrl, expiresIn: EXPIRES_IN });
};

export const handler = withErrorHandling(rawHandler);
