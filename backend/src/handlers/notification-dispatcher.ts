import type { SNSHandler } from 'aws-lambda';
import { SendTemplatedEmailCommand } from '@aws-sdk/client-ses';
import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { getRepository, getSesClient, getSsmClient } from '../api/deps';
import { logger } from '../api/logger';
import type { DomainEvent } from '@clos/shared-types';
import type { Repository } from '../data/repository';

export const handler: SNSHandler = async (snsEvent) => {
  for (const record of snsEvent.Records) {
    const event = JSON.parse(record.Sns.Message) as DomainEvent;
    logger.info('Processing domain event', { type: event.type });
    try {
      await dispatch(event);
    } catch (err) {
      logger.error('Failed to dispatch event', { type: event.type, err });
      // Don't rethrow — process remaining records
    }
  }
};

async function getAdminEmail(): Promise<string> {
  const paramName = process.env.ADMIN_EMAIL_PARAM_NAME!;
  const res = await getSsmClient().send(new GetParameterCommand({ Name: paramName }));
  return res.Parameter!.Value!;
}

async function sendEmail(params: {
  to: string;
  template: string;
  templateData: object;
  replyTo: string;
}): Promise<void> {
  const sesFrom = process.env.SES_FROM_ADDRESS!;
  await getSesClient().send(new SendTemplatedEmailCommand({
    Source: sesFrom,
    ReplyToAddresses: [params.replyTo],
    Destination: { ToAddresses: [params.to] },
    Template: params.template,
    TemplateData: JSON.stringify(params.templateData),
  }));
}

async function dispatch(event: DomainEvent): Promise<void> {
  const repo: Repository = getRepository();

  switch (event.type) {
    case 'BOOKING_CREATED':
    case 'BOOKING_UPDATED': {
      if (!event.userId) return;
      const [user, adminEmail] = await Promise.all([repo.getUser(event.userId), getAdminEmail()]);
      if (!user) { logger.warn('User not found for notification', { userId: event.userId }); return; }
      await sendEmail({
        to: user.email,
        template: event.type === 'BOOKING_CREATED' ? 'booking-created' : 'booking-updated',
        templateData: { ...event, user },
        replyTo: adminEmail,
      });
      break;
    }

    case 'BOOKING_CANCELLED': {
      if (event.reason === 'USER_DELETED' || !event.userId) return;
      const [user, adminEmail] = await Promise.all([repo.getUser(event.userId), getAdminEmail()]);
      if (!user) return;
      await sendEmail({
        to: user.email,
        template: 'booking-cancelled',
        templateData: { ...event, user },
        replyTo: adminEmail,
      });
      break;
    }

    case 'BOOKING_CONFLICT_DETECTED': {
      const adminEmail = await getAdminEmail();
      await sendEmail({
        to: adminEmail,
        template: 'admin-conflict-alert',
        templateData: event,
        replyTo: adminEmail,
      });
      break;
    }

    case 'USER_INVITED':
      // Cognito handles the invitation email natively
      break;
  }
}
