import { app, type InvocationContext } from '@azure/functions';
import { EmailClient, type EmailMessage } from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';
import { getRepository } from '../api/deps';
import { logger } from '../api/logger';
import type { DomainEvent } from '@clos/shared-types';

function getEmailClient(): EmailClient {
  const endpoint = process.env.ACS_ENDPOINT;
  if (!endpoint) throw new Error('ACS_ENDPOINT environment variable is required');
  return new EmailClient(`https://${endpoint}`, new DefaultAzureCredential());
}

type RenderedEmail = { subject: string; html: string };

function renderTemplate(template: string, data: Record<string, unknown>): RenderedEmail {
  switch (template) {
    case 'booking-created':
      return {
        subject: 'Confirmation de votre réservation — Le Clos Bon Accueil',
        html: `<p>Bonjour,</p><p>Votre réservation (réf. ${data.bookingId}) pour la chambre <strong>${data.roomId}</strong> du ${data.start} au ${data.end} a bien été enregistrée.</p><p>À bientôt,<br>Le Clos Bon Accueil</p>`,
      };
    case 'booking-updated':
      return {
        subject: 'Modification de votre réservation — Le Clos Bon Accueil',
        html: `<p>Bonjour,</p><p>Votre réservation (réf. ${data.bookingId}) a été mise à jour.</p><p>À bientôt,<br>Le Clos Bon Accueil</p>`,
      };
    case 'booking-cancelled':
      return {
        subject: 'Annulation de votre réservation — Le Clos Bon Accueil',
        html: `<p>Bonjour,</p><p>Votre réservation (réf. ${data.bookingId}) a été annulée.</p><p>À bientôt,<br>Le Clos Bon Accueil</p>`,
      };
    case 'admin-conflict-alert': {
      const ids = data.bookingIds as string[];
      return {
        subject: `[ALERTE] Conflit de réservation détecté — chambre ${data.roomId}`,
        html: `<p>Un conflit a été détecté pour la chambre <strong>${data.roomId}</strong>.</p><p>Réservations en conflit : ${ids.join(', ')}.</p><p>Veuillez résoudre ce conflit manuellement.</p>`,
      };
    }
    default:
      return { subject: template, html: `<pre>${JSON.stringify(data, null, 2)}</pre>` };
  }
}

async function sendEmail(params: {
  to: string;
  template: string;
  templateData: object;
  replyTo: string;
}): Promise<void> {
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? 'noreply@clos-bon-accueil.fr';
  const { subject, html } = renderTemplate(params.template, params.templateData as Record<string, unknown>);
  const message: EmailMessage = {
    senderAddress: fromAddress,
    recipients: { to: [{ address: params.to }] },
    replyTo: [{ address: params.replyTo }],
    content: { subject, html },
  };
  const client = getEmailClient();
  const poller = await client.beginSend(message);
  await poller.pollUntilDone();
  logger.info('Email sent', { template: params.template, to: params.to });
}

async function getAdminEmail(): Promise<string> {
  return process.env.ADMIN_EMAIL ?? 'admin@clos-bon-accueil.fr';
}

export async function dispatch(event: DomainEvent): Promise<void> {
  const repo = getRepository();

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
      await sendEmail({ to: user.email, template: 'booking-cancelled', templateData: { ...event, user }, replyTo: adminEmail });
      break;
    }

    case 'BOOKING_CONFLICT_DETECTED': {
      const adminEmail = await getAdminEmail();
      await sendEmail({ to: adminEmail, template: 'admin-conflict-alert', templateData: event, replyTo: adminEmail });
      break;
    }

    case 'USER_INVITED':
      // Entra handles invitation emails natively
      break;
  }
}

// Service Bus topic trigger — subscription name matches notifications.bicep resource 'dispatcher'
app.serviceBusTopic('notification-dispatcher', {
  connection: 'SERVICEBUS_FULLY_QUALIFIED_NAMESPACE',
  topicName: process.env.SERVICEBUS_TOPIC_NAME ?? 'clos-notifications',
  subscriptionName: 'dispatcher',
  handler: async (message: unknown, context: InvocationContext) => {
    const event = message as DomainEvent;
    logger.info('Processing domain event', { type: event.type });
    try {
      await dispatch(event);
    } catch (err) {
      context.error('Failed to dispatch event', { type: event.type, err });
    }
  },
});
